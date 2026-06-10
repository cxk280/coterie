/** The `coterie chat` REPL: a conversational loop where each turn runs through
 *  the active coordination mode and returns the synthesized result. */

import { setMaxListeners } from "node:events";
import { createInterface } from "node:readline";

import kleur from "kleur";

import { gitRepoReady, IsolatedWorktreeExecutor, LocalSubprocessExecutor } from "../core/executor.js";
import { buildRoleLlms, coordinationCliFor } from "../core/llm/build.js";
import { type AgentRun, type Mode, initialState, MODES } from "../core/state.js";
import { validateRuntimeConfig } from "../core/validate.js";
import { buildGraph } from "../graph.js";
import { type AgentCfg, defaultConfig } from "./configs.js";
import { formatDoctor, MIN_AGENTS, runDoctor } from "./doctor.js";
import { runFinalizer } from "./finalizer.js";
import { agentStatuses } from "./preflight.js";
import { classifyFailure, digestRound } from "./render.js";
import { rule, Trace } from "./trace.js";
import { Transcript } from "./transcript.js";

/** Bare words (no leading slash) that mean "leave the REPL". Without this they'd
 *  be sent to the agents as a task — wasting a real (subscription) round and the
 *  user's time on the most reflexive action there is. */
const QUIT_WORDS = new Set(["exit", "quit", "q", ":q"]);

const HELP = `
Commands:
  /mode <name>   switch coordination mode (${MODES.join(", ")})
  /plan [on|off] toggle plan mode — deliberate and show the plan, but make NO
                 file changes (no arg flips it; on/off set it explicitly)
  /show /hide    show or hide the live agent exchanges
  /clear         forget the conversation so far
  /help          this help
  /exit          quit (or just type 'exit' / 'quit')
  Ctrl+C         cancel the current turn (press again at the prompt to quit)

Each turn the agents deliberate (review/critique/compete, read-only in throwaway
workspaces — they never edit your files), then one final agent applies the edits
in your workdir and writes the reply — so file edits land in every mode, but only
the finalizer makes them. The mode shapes the deliberation: 'single' is quickest;
'adversarial' adds an auditor/judge loop; 'debate' / 'tournament' / 'consensus'
get more perspectives before the finalizer acts.

Plan mode (/plan) skips the file-changing step entirely: the agents still
deliberate, then the finalizer writes you a plan instead of editing — so you can
see what they'd do and stay confident nothing on disk changes until you toggle off.
`.trim();

export async function runChat(opts: { mode: Mode; workdir: string; quiet: boolean; plan?: boolean }): Promise<void> {
  let mode = opts.mode;
  // Plan mode: deliberate as usual but make NO file changes — the finalizer writes
  // a plan instead of editing. Toggle with /plan; the prompt shows it so the user
  // can always tell whether this turn will touch disk.
  let planMode = opts.plan ?? false;

  // Build the session lineup from whichever agents are actually available; need
  // at least two to coordinate. Roles within each mode are auto-assigned from it.
  // Probe every known agent once, then derive both the ready lineup and the
  // installed-but-signed-out ones (so we can tell the user why they're missing).
  const statuses = agentStatuses();
  const agents = statuses.filter((s) => s.status.ok).map((s) => s.agent);
  const signedOut = statuses.filter((s) => s.status.reason === "not signed in");

  if (agents.length < MIN_AGENTS) {
    console.error(kleur.yellow(formatDoctor(runDoctor())));
    process.exitCode = 1;
    return;
  }

  // Deliberation normally runs in an isolated git worktree of the workdir. Outside
  // a git repo we can't isolate and can't safely apply edits, so rather than refuse
  // to start we run read-only: plan mode is locked on, agents read the workdir in
  // place, and the finalizer replies with a plan/answer without touching disk. That
  // lets you use coterie to just talk (about code or anything) anywhere.
  const git = gitRepoReady(opts.workdir);
  const gitReady = git.ok;
  if (!gitReady) {
    planMode = true;
  }

  const transcript = new Transcript();
  const trace = new Trace(!opts.quiet);
  trace.attach();

  // Invocation-agnostic: the REPL is reached by bare `coterie` and `coterie chat`
  // alike, so the banner names the product, not the subcommand.
  console.log(kleur.cyan().bold("▲ coterie"));
  console.log(
    kleur.dim(
      `  mode=${mode} · workdir=${opts.workdir} · agents: ${agents.map((a) => a.id).join(", ")} · $0 metered\n` +
        `  modes: ${MODES.join(", ")}\n` +
        "  Each turn: agents deliberate (read-only), then one finalizer applies edits + replies. /mode to change modes. /help for commands.",
    ),
  );
  if (!gitReady) {
    console.log(
      kleur.yellow(
        `  ◇ ${opts.workdir} is ${git.reason} — running in plan mode (read-only): coterie will deliberate and reply ` +
          "with a plan/answer but make NO file changes.\n" +
          "    To let coterie edit files, run it inside a git repo (git init && git add -A && git commit -m init).",
      ),
    );
  } else if (planMode) {
    console.log(kleur.yellow("  ◇ plan mode ON — coterie will deliberate and reply with a plan, but make NO file changes. /plan to toggle."));
  }
  // An agent that's installed but signed out isn't broken — it just can't join.
  // Say so clearly (and how to fix it) instead of silently dropping it.
  for (const s of signedOut) {
    console.log(
      kleur.yellow(
        `  ⚠ ${s.status.cli} is installed but not signed in — sitting this session out. ${s.status.fix ?? ""}`.trimEnd(),
      ),
    );
  }
  // Coordination (routing / judging / merging) prefers Claude but falls back to
  // codex/cursor, so it works without Claude. Note the coordinator if it's not
  // Claude, so the choice is visible.
  const coordCli = coordinationCliFor(agents.map((a) => a.id));
  if (coordCli !== "claude") {
    console.log(kleur.dim(`  coordination: ${coordCli} (Claude not detected — using an available agent)`));
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const setPrompt = () => rl.setPrompt(kleur.cyan(`\ncoterie(${mode}${planMode ? " · plan" : ""})› `));

  // Ctrl+C cancels the in-flight turn (aborting the agent subprocesses) and keeps
  // the session alive; at the prompt with nothing running it quits.
  let activeAbort: AbortController | null = null;
  // Agents that hit a hard limit / auth failure this session, with the reason.
  // We drop them from later turns when ≥2 agents remain; otherwise we keep them
  // and bubble up the limit info (you can't coordinate with fewer than two).
  const sidelined = new Map<string, string>();

  rl.on("SIGINT", () => {
    if (activeAbort && !activeAbort.signal.aborted) {
      activeAbort.abort();
      console.log(kleur.yellow("\n  ↩ canceling this turn… (Ctrl+C again at the prompt to quit)"));
    } else {
      rl.close();
    }
  });

  setPrompt();
  rl.prompt();

  for await (const line of rl) {
    const text = line.trim();
    try {
      if (!text) {
        // no-op
      } else if (QUIT_WORDS.has(text.toLowerCase())) {
        break;
      } else if (text.startsWith("/")) {
        const [rawCmd, ...rest] = text.slice(1).split(/\s+/);
        const cmd = (rawCmd ?? "").toLowerCase();
        if (cmd === "exit" || cmd === "quit" || cmd === "q") break;
        else if (cmd === "help") console.log(HELP);
        else if (cmd === "hide") { trace.visible = false; console.log(kleur.dim("  (trace hidden)")); }
        else if (cmd === "show") { trace.visible = true; console.log(kleur.dim("  (trace shown)")); }
        else if (cmd === "clear") { transcript.clear(); console.log(kleur.dim("  (conversation cleared)")); }
        else if (cmd === "mode") {
          const next = (rest[0] ?? "").toLowerCase() as Mode;
          if (MODES.includes(next)) { mode = next; setPrompt(); console.log(kleur.dim(`  (mode → ${mode})`)); }
          else console.log(kleur.red(`  unknown mode '${rest[0] ?? ""}'; pick one of ${MODES.join(", ")}`));
        } else if (cmd === "plan") {
          // Outside a git repo there's no safe way to apply edits, so plan mode is
          // locked on — don't let /plan toggle it off and then silently no-op.
          if (!gitReady) {
            console.log(
              kleur.yellow(
                "  (plan mode is locked on — there's no git repo here, so coterie can't safely apply edits. Run it inside a git repo to enable file changes.)",
              ),
            );
            rl.prompt();
            continue;
          }
          const arg = (rest[0] ?? "").toLowerCase();
          if (arg === "on") planMode = true;
          else if (arg === "off") planMode = false;
          else if (arg === "") planMode = !planMode;
          else { console.log(kleur.red(`  usage: /plan [on|off]`)); rl.prompt(); continue; }
          setPrompt();
          console.log(
            planMode
              ? kleur.yellow("  (plan mode ON — agents deliberate, the finalizer replies with a plan, and NO files are changed)")
              : kleur.dim("  (plan mode OFF — the finalizer will apply edits to your workdir again)"),
          );
        } else console.log(kleur.red(`  unknown command '/${rawCmd ?? ""}' — /help`));
      } else {
        // Build this turn's lineup: drop sidelined agents, but never below the
        // two needed to coordinate.
        let lineup = agents.filter((a) => !sidelined.has(a.id));
        if (lineup.length < MIN_AGENTS) {
          for (const a of agents) {
            if (sidelined.has(a.id)) {
              console.log(
                kleur.yellow(
                  `  ⚠ ${a.id} is unavailable (${sidelined.get(a.id)}) but kept — dropping it would leave fewer than ${MIN_AGENTS} agents.`,
                ),
              );
            }
          }
          lineup = agents;
        } else if (lineup.length < agents.length) {
          for (const a of agents) {
            if (sidelined.has(a.id)) console.log(kleur.dim(`  (sitting out ${a.id} this session — ${sidelined.get(a.id)})`));
          }
        }

        activeAbort = new AbortController();
        // LangGraph attaches an abort listener per step; lift the ceiling so a
        // multi-round turn doesn't trip Node's MaxListenersExceededWarning.
        setMaxListeners(128, activeAbort.signal);
        try {
          const runs = await runTurn(text, mode, opts.workdir, lineup, transcript, trace, planMode, gitReady, activeAbort.signal);
          // Learn from failures: sideline agents that hit a limit / auth problem.
          for (const r of runs ?? []) {
            const c = classifyFailure(r);
            if (c.kind && !sidelined.has(r.agent_id)) {
              sidelined.set(r.agent_id, c.detail || c.kind);
              console.log(
                kleur.yellow(
                  `  ▸ ${r.agent_id} hit a ${c.kind} issue — sitting it out for the rest of this session. ${c.detail}`.trimEnd(),
                ),
              );
            }
          }
        } finally {
          activeAbort = null;
        }
      }
    } catch (e) {
      console.error(kleur.red(`  error: ${e instanceof Error ? e.message : String(e)}`));
    }
    rl.prompt();
  }

  trace.detach();
  rl.close();
  console.log(kleur.dim("\nbye."));
}

async function runTurn(
  text: string,
  mode: Mode,
  workdir: string,
  agents: AgentCfg[],
  transcript: Transcript,
  trace: Trace,
  planMode: boolean,
  gitReady: boolean,
  signal: AbortSignal,
): Promise<AgentRun[] | null> {
  const cfg = defaultConfig(mode, agents);
  validateRuntimeConfig(cfg);
  // Coordination runs on an available agent's CLI — prefer Claude, else fall back
  // to codex/cursor so a turn works without Claude on the machine.
  const coordCli = coordinationCliFor(agents.map((a) => a.id));
  const llms = await buildRoleLlms(mode, cfg, coordCli);
  // The read-only deliberation executor: inside a git repo it runs in a throwaway
  // worktree (full isolation); outside one we can't make a worktree, so we run the
  // adapter read-only directly in the workdir — still no edits, just no isolation.
  // Either way the finalizer is the sole mutator (and only when gitReady).
  const readOnlyExecutor = () =>
    gitReady ? new IsolatedWorktreeExecutor({ readOnly: true }) : new LocalSubprocessExecutor({ readOnly: true });
  const graph = buildGraph({ workdir, executor: readOnlyExecutor(), config: cfg, ...llms });

  const task = transcript.taskFor(text);
  const initial = initialState(task, cfg);

  trace.reset();
  if (trace.visible) console.log("\n" + rule(`deliberating · ${mode}`));

  let final: any = initial;
  try {
    // recursionLimit is a hard backstop against an unbounded loop (on top of each
    // mode's own round cap); the modes settle in far fewer supersteps.
    for await (const state of await graph.stream(initial, { streamMode: "values", signal, recursionLimit: 24 })) {
      final = state;
      trace.update(state);
    }

    // Don't apply edits off a deliberation that halted (budget) or is waiting on
    // a human — the finalizer is the sole mutator, so skipping it leaves the
    // workdir untouched.
    if (final.status === "failed" || final.status === "awaiting_human") {
      console.log(
        kleur.yellow(`\n  ⚠ deliberation ended as '${final.status}' — not applying any edits this turn.`),
      );
      transcript.add("user", text);
      transcript.add("assistant", `(no changes — deliberation ended as ${final.status})`);
      return final.runs ?? [];
    }

    if (trace.visible) console.log("\n" + rule(planMode ? "planning" : "finalizing"));
    // The finalizer (the judge seat) is the first available agent. Only pass a
    // model when it's Claude Code — the judge-model aliases are Claude-specific.
    const finalizerAdapter = agents[0]!.adapter;
    const finalizerModel = finalizerAdapter === "claude-code" ? "claude-opus-4-7" : undefined;
    // In plan mode the finalizer also runs read-only in a throwaway worktree, so
    // even it can't change the user's files — they get a plan, not edits.
    const { answer, run } = await runFinalizer({
      task,
      digest: digestRound(final),
      workdir,
      adapter: finalizerAdapter,
      model: finalizerModel,
      planMode,
      executor: planMode ? readOnlyExecutor() : undefined,
      signal,
    });

    const reply =
      answer ||
      (planMode ? "(the finalizer produced no plan)" : "(the finalizer produced no reply — check the workdir for edits)");
    console.log("\n" + kleur.cyan().bold(planMode ? "coterie (plan) ›" : "coterie ›") + " " + reply);
    if (planMode) {
      console.log(kleur.yellow("  ◇ plan mode — no files were changed. Toggle off with /plan to let coterie apply it."));
    }

    const totalSpend = (final.spend_usd ?? 0) + (run.cost_estimate_usd ?? 0);
    if (totalSpend) console.log(kleur.dim(`  (≈ $${totalSpend.toFixed(4)} subscription usage — $0 metered)`));

    transcript.add("user", text);
    transcript.add("assistant", reply);
    return [...(final.runs ?? []), run];
  } catch (e) {
    if (signal.aborted || (e instanceof Error && e.name === "AbortError")) {
      console.log(
        kleur.yellow("\n  ↩ canceled — back to the prompt.") +
          kleur.dim(" (Deliberation runs in a scratch copy, so your files are untouched.)"),
      );
      return null;
    }
    throw e;
  }
}
