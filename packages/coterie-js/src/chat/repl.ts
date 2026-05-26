/** The `coterie chat` REPL: a conversational loop where each turn runs through
 *  the active coordination mode and returns the synthesized result. */

import { createInterface } from "node:readline";

import kleur from "kleur";

import { IsolatedWorktreeExecutor, LocalSubprocessExecutor, type AdapterExecutor } from "../core/executor.js";
import type { LLMClient } from "../core/llm/base.js";
import { buildLLM } from "../core/llm/build.js";
import type { Mode } from "../core/state.js";
import { buildGraph } from "../graph.js";
import { defaultConfig } from "./configs.js";
import { formatProblems, preflight } from "./preflight.js";
import { Trace } from "./trace.js";
import { Transcript } from "./transcript.js";

const MODES: Mode[] = ["single", "consensus", "adversarial", "debate", "tournament"];

async function buildLlms(mode: Mode, cfg: any): Promise<Record<string, LLMClient | null>> {
  return {
    supervisor_llm: mode === "single" ? await buildLLM(cfg.router?.model) : null,
    judge_llm: ["adversarial", "tournament", "debate"].includes(mode) ? await buildLLM(cfg[mode]?.judge?.model) : null,
    consensus_llm: mode === "consensus" ? await buildLLM(cfg.consensus?.engine?.model) : null,
    moderator_llm: mode === "debate" ? await buildLLM(cfg.debate?.moderator?.model) : null,
    planner_llm: cfg.planner?.enabled ? await buildLLM(cfg.planner?.model) : null,
  };
}

function buildExecutor(mode: Mode): AdapterExecutor {
  return mode === "consensus" || mode === "tournament" ? new IsolatedWorktreeExecutor() : new LocalSubprocessExecutor();
}

function extractAnswer(final: any): string {
  const runs = final.runs ?? [];
  const last = runs[runs.length - 1];
  const text = (last?.stdout ?? "").trim();
  return text || "(the round produced no textual output — check the workdir for edits)";
}

const HELP = `
Commands:
  /mode <name>   switch coordination mode (${MODES.join(", ")})
  /show /hide    show or hide the live round trace
  /clear         forget the conversation so far
  /help          this help
  /exit          quit

Tip: coding edits land cleanest in 'single' or 'adversarial' (one implementer,
gated by the auditor/judge). 'debate' / 'tournament' / 'consensus' are best for
decisions and high-reliability answers (a synthesized verdict, not competing edits).
`.trim();

export async function runChat(opts: { mode: Mode; workdir: string; quiet: boolean }): Promise<void> {
  let mode = opts.mode;

  const problems = preflight(defaultConfig(mode));
  if (problems.length) {
    console.error(kleur.yellow(formatProblems(problems)));
    process.exitCode = 1;
    return;
  }

  const transcript = new Transcript();
  const trace = new Trace(!opts.quiet);

  console.log(kleur.cyan().bold("▲ coterie chat"));
  console.log(
    kleur.dim(
      `  mode=${mode} · workdir=${opts.workdir} · coordination=subscription (claude -p)\n` +
        "  Every turn runs a multi-agent round behind the scenes. /help for commands.",
    ),
  );

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const setPrompt = () => rl.setPrompt(kleur.cyan(`\ncoterie(${mode})› `));
  setPrompt();
  rl.prompt();

  for await (const line of rl) {
    const text = line.trim();
    try {
      if (!text) {
        // no-op
      } else if (text.startsWith("/")) {
        const [cmd, ...rest] = text.slice(1).split(/\s+/);
        if (cmd === "exit" || cmd === "quit") break;
        else if (cmd === "help") console.log(HELP);
        else if (cmd === "hide") { trace.visible = false; console.log(kleur.dim("  (trace hidden)")); }
        else if (cmd === "show") { trace.visible = true; console.log(kleur.dim("  (trace shown)")); }
        else if (cmd === "clear") { transcript.clear(); console.log(kleur.dim("  (conversation cleared)")); }
        else if (cmd === "mode") {
          const next = rest[0] as Mode;
          if (MODES.includes(next)) { mode = next; setPrompt(); console.log(kleur.dim(`  (mode → ${mode})`)); }
          else console.log(kleur.red(`  unknown mode '${rest[0] ?? ""}'; pick one of ${MODES.join(", ")}`));
        } else console.log(kleur.red(`  unknown command '/${cmd}' — /help`));
      } else {
        await runTurn(text, mode, opts.workdir, transcript, trace);
      }
    } catch (e) {
      console.error(kleur.red(`  error: ${e instanceof Error ? e.message : String(e)}`));
    }
    rl.prompt();
  }

  rl.close();
  console.log(kleur.dim("\nbye."));
}

async function runTurn(
  text: string,
  mode: Mode,
  workdir: string,
  transcript: Transcript,
  trace: Trace,
): Promise<void> {
  const cfg = defaultConfig(mode);
  const llms = await buildLlms(mode, cfg);
  const graph = buildGraph({ workdir, executor: buildExecutor(mode), config: cfg, ...llms });

  const initial = {
    task: transcript.taskFor(text),
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
  if (trace.visible) console.log(kleur.dim(`  ↻ ${mode} round…`));

  let final: any = initial;
  for await (const state of await graph.stream(initial, { streamMode: "values" })) {
    final = state;
    trace.update(state);
  }

  console.log("\n" + extractAnswer(final));
  if (final.spend_usd) console.log(kleur.dim(`  (round spend ≈ $${final.spend_usd.toFixed(4)})`));

  transcript.add("user", text);
  transcript.add("assistant", extractAnswer(final));
}
