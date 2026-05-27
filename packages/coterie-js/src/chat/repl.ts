/** The `coterie chat` REPL: a conversational loop where each turn runs through
 *  the active coordination mode and returns the synthesized result. */

import { setMaxListeners } from "node:events";
import { createInterface } from "node:readline";

import kleur from "kleur";

import { gitRepoReady, IsolatedWorktreeExecutor } from "../core/executor.js";
import type { LLMClient } from "../core/llm/base.js";
import { type CoordinationCli, buildLLM, coordinationCliFor } from "../core/llm/build.js";
import type { AgentRun, Mode } from "../core/state.js";
import { validateRuntimeConfig } from "../core/validate.js";
import { buildGraph } from "../graph.js";
import { type AgentCfg, defaultConfig } from "./configs.js";
import { formatDoctor, MIN_AGENTS, runDoctor } from "./doctor.js";
import { runFinalizer } from "./finalizer.js";
import { agentStatuses } from "./preflight.js";
import { classifyFailure, digestRound } from "./render.js";
import { rule, Trace } from "./trace.js";
import { Transcript } from "./transcript.js";

const MODES: Mode[] = ["single", "adversarial", "debate", "tournament", "consensus"];

/** Bare words (no leading slash) that mean "leave the REPL". Without this they'd
 *  be sent to the agents as a task — wasting a real (subscription) round and the
 *  user's time on the most reflexive action there is. */
const QUIT_WORDS = new Set(["exit", "quit", "q", ":q"]);

async function buildLlms(mode: Mode, cfg: any, cli: CoordinationCli): Promise<Record<string, LLMClient | null>> {
  return {
    supervisor_llm: mode === "single" ? await buildLLM(cfg.router?.model, cli) : null,
    judge_llm: ["adversarial", "tournament", "debate"].includes(mode) ? await buildLLM(cfg[mode]?.judge?.model, cli) : null,
    consensus_llm: mode === "consensus" ? await buildLLM(cfg.consensus?.engine?.model, cli) : null,
    moderator_llm: mode === "debate" ? await buildLLM(cfg.debate?.moderator?.model, cli) : null,
    planner_llm: cfg.planner?.enabled ? await buildLLM(cfg.planner?.model, cli) : null,
  };
}

const HELP = `
Commands:
  /mode <name>   switch coordination mode (${MODES.join(", ")})
  /show /hide    show or hide the live agent exchanges
  /clear         forget the conversation so far
  /help          this help
  /exit          quit (or just type 'exit' / 'quit')
  Ctrl+C         cancel the current turn (press again at the prompt to quit)

Each turn the agents deliberate (review/critique/compete, in throwaway
workspaces), then one final agent applies the edits in your workdir and writes
the reply — so file edits land in every mode. The mode shapes the deliberation:
'single' is quickest; 'adversarial' adds an auditor/judge loop; 'debate' /
'tournament' / 'consensus' get more perspectives before the finalizer acts.
`.trim();

export async function runChat(opts: { mode: Mode; workdir: string; quiet: boolean }): Promise<void> {
  let mode = opts.mode;

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

  // Deliberation runs in an isolated git worktree of the workdir, so it must be a
  // git repo with a commit — otherwise every turn would error mid-flight.
  const git = gitRepoReady(opts.workdir);
  if (!git.ok) {
    console.error(
      kleur.yellow(
        `Can't start: ${opts.workdir} is ${git.reason}. coterie runs each turn's deliberation in an ` +
          "isolated git worktree, so the working directory must be a git repo with at least one commit.\n" +
          "  Fix: cd into your project and run `git init && git add -A && git commit -m init`.",
      ),
    );
    process.exitCode = 1;
    return;
  }

  const transcript = new Transcript();
  const trace = new Trace(!opts.quiet);
  trace.attach();

  console.log(kleur.cyan().bold("▲ coterie chat"));
  console.log(
    kleur.dim(
      `  mode=${mode} · workdir=${opts.workdir} · agents: ${agents.map((a) => a.id).join(", ")} · $0 metered\n` +
        "  Each turn: agents deliberate, then one finalizer applies edits + replies. /help for commands. /mode to change modes.",
    ),
  );
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
  const setPrompt = () => rl.setPrompt(kleur.cyan(`\ncoterie(${mode})› `));

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
          const runs = await runTurn(text, mode, opts.workdir, lineup, transcript, trace, activeAbort.signal);
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
  signal: AbortSignal,
): Promise<AgentRun[] | null> {
  const cfg = defaultConfig(mode, agents);
  validateRuntimeConfig(cfg);
  // Coordination runs on an available agent's CLI — prefer Claude, else fall back
  // to codex/cursor so a turn works without Claude on the machine.
  const coordCli = coordinationCliFor(agents.map((a) => a.id));
  const llms = await buildLlms(mode, cfg, coordCli);
  // Deliberation never touches the real workdir — it runs in throwaway worktrees
  // and feeds the finalizer as advice. The finalizer is the sole mutator.
  const graph = buildGraph({ workdir, executor: new IsolatedWorktreeExecutor(), config: cfg, ...llms });

  const task = transcript.taskFor(text);
  const initial = {
    task,
    mode,
    plan: [],
    current_step_idx: 0,
    runs: [],
    artifacts: {},
    status: "planning",
    config: cfg,
    spend_usd: 0,
    route_history: [],
    judge_history: [],
    next_agent: null,
    mode_state: {},
  };

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

    if (trace.visible) console.log("\n" + rule("finalizing"));
    // The finalizer (the judge seat) is the first available agent. Only pass a
    // model when it's Claude Code — the judge-model aliases are Claude-specific.
    const finalizerAdapter = agents[0]!.adapter;
    const finalizerModel = finalizerAdapter === "claude-code" ? "claude-opus-4-7" : undefined;
    const { answer, run } = await runFinalizer({
      task,
      digest: digestRound(final),
      workdir,
      adapter: finalizerAdapter,
      model: finalizerModel,
      signal,
    });

    const reply = answer || "(the finalizer produced no reply — check the workdir for edits)";
    console.log("\n" + kleur.cyan().bold("coterie ›") + " " + reply);

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
