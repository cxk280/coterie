#!/usr/bin/env node
/** Composition root. Picks LLM provider per role + executor. */

import { setMaxListeners } from "node:events";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { Command } from "commander";
import kleur from "kleur";

// A turn aborts via one AbortSignal that LangGraph fans out to per-step derived
// signals; raise the default ceiling for all newly-created EventTargets so a
// multi-round turn never trips Node's MaxListenersExceededWarning.
setMaxListeners(64);

// Read --version from package.json at runtime so it can never drift from the
// published version (dist/cli.js → ../package.json).
const VERSION = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
).version as string;

import { formatProblems, preflight } from "./chat/preflight.js";
import { renderFailure, runFailed } from "./chat/render.js";
import { loadConfig } from "./config.js";
import { progress } from "./core/progress.js";
import { validateRuntimeConfig } from "./core/validate.js";
import { IsolatedWorktreeExecutor, LocalSubprocessExecutor, type AdapterExecutor } from "./core/executor.js";
import type { LLMClient } from "./core/llm/base.js";
import { buildLLM, coordinationCliFor } from "./core/llm/build.js";
import { buildGraph } from "./graph.js";

import "./adapters/index.js";  // trigger adapter registration
import "./modes/index.js";     // trigger mode registration

function buildExecutor(cfg: any): AdapterExecutor {
  const explicit = cfg.executor?.kind;
  if (explicit === "local") return new LocalSubprocessExecutor();
  if (explicit === "isolated") return new IsolatedWorktreeExecutor();
  if (explicit != null) {
    console.warn(kleur.yellow(`unknown executor.kind '${explicit}'; using the mode default (local/isolated)`));
  }
  // `run` has no separate finalizer, so adversarial/debate use the local executor
  // on purpose — their edits land in the workdir (that's the point of `run`).
  // The parallel many-agent modes isolate to avoid clobbering each other.
  if (cfg.mode === "consensus" || cfg.mode === "tournament") return new IsolatedWorktreeExecutor();
  return new LocalSubprocessExecutor();
}

async function main() {
  const program = new Command();
  program
    .name("coterie")
    .description("Chat with a team of AI coding agents that collaborate on each task — in your terminal.")
    .version(VERSION)
    .showHelpAfterError("(run `coterie --help` to see the available commands)");

  program
    .command("run")
    .description("Run one task through a coordination mode from a config file (for scripting/CI; for interactive use see `chat`).")
    .argument("<task>", "Task to run through the agent graph")
    .requiredOption("--config <path>", "Path to a coterie.yaml config (see examples/ in the repo for templates)")
    .option("--workdir <path>", "Working directory", ".")
    .action(async (task: string, opts: { config: string; workdir: string }) => {
      const cfg = loadConfig(opts.config);
      validateRuntimeConfig(cfg);

      // Same friendly preflight as chat: surface missing/signed-out agents up
      // front instead of failing with a raw spawn error deep in the graph.
      const problems = preflight(cfg);
      if (problems.length) {
        console.error(kleur.yellow(formatProblems(problems)));
        process.exit(1);
      }

      const mode = cfg.mode;
      const executor = buildExecutor(cfg);
      const coordCli = coordinationCliFor((cfg.agents as any[]).map((a) => a.id));

      const llms: Record<string, LLMClient | null> = {
        supervisor_llm: mode === "single" ? await buildLLM(cfg.router?.model, coordCli) : null,
        judge_llm: ["adversarial", "tournament", "debate"].includes(mode)
          ? await buildLLM(cfg[mode]?.judge?.model, coordCli)
          : null,
        consensus_llm: mode === "consensus" ? await buildLLM(cfg.consensus?.engine?.model, coordCli) : null,
        moderator_llm: mode === "debate" ? await buildLLM(cfg.debate?.moderator?.model, coordCli) : null,
        planner_llm: cfg.planner?.enabled ? await buildLLM(cfg.planner?.model, coordCli) : null,
      };

      const graph = buildGraph({ workdir: opts.workdir, executor, config: cfg, ...llms });
      console.log(kleur.cyan().bold(`— coterie · mode=${mode} · ${cfg.agents.length} agents —`));

      // Stream live progress so a long run isn't a silent wait.
      const onDone = ({ run }: { run: any }) => {
        const tag = runFailed(run) ? kleur.yellow(`⚠ ${renderFailure(run)}`) : kleur.dim("done");
        console.log(kleur.dim(`  · ${run.role} (${run.agent_id}) `) + tag);
      };
      progress.on("done", onDone);

      const initial = {
        task, mode, plan: [], current_step_idx: 0, runs: [], artifacts: {},
        status: "planning", config: cfg, spend_usd: 0, route_history: [],
        judge_history: [], next_agent: null, mode_state: {},
      };
      const final: any = await graph.invoke(initial, { recursionLimit: 24 }).finally(() => progress.off("done", onDone));
      if (final.runs?.length) console.log(final.runs[final.runs.length - 1].stdout);
      for (const r of final.runs ?? []) {
        if (runFailed(r)) console.error(kleur.yellow(`⚠ ${r.role} (${r.agent_id}) ${renderFailure(r)}`));
      }
      console.log(kleur.dim(`total spend ≈ $${(final.spend_usd ?? 0).toFixed(4)}`));
      console.log(kleur.bold(`— ${final.status} —`));
      process.exit(final.status === "done" ? 0 : 1);
    });

  program
    .command("chat")
    .description("Conversational REPL: each turn runs through a coordination mode behind the scenes.")
    .option("--mode <mode>", "Coordination mode (single|adversarial|debate|tournament|consensus)", "adversarial")
    .option("--workdir <path>", "Directory the agents read/edit", ".")
    .option("--quiet", "Start with the live agent exchanges hidden (show only the final reply)", false)
    .option("--plan", "Start in plan mode: deliberate and reply with a plan, but make NO file changes (toggle in-session with /plan)", false)
    .action(async (opts: { mode: string; workdir: string; quiet: boolean; plan: boolean }) => {
      const { runChat } = await import("./chat/repl.js");
      const valid = ["single", "adversarial", "debate", "tournament", "consensus"];
      if (!valid.includes(opts.mode)) {
        console.error(`unknown mode '${opts.mode}'; pick one of ${valid.join(", ")}`);
        process.exit(2);
      }
      await runChat({ mode: opts.mode as any, workdir: opts.workdir, quiet: opts.quiet, plan: opts.plan });
    });

  program
    .command("doctor")
    .description("Check which agent CLIs are installed and signed in (Coterie needs at least two).")
    .action(async () => {
      const { runDoctor, formatDoctor } = await import("./chat/doctor.js");
      const result = runDoctor();
      console.log(formatDoctor(result));
      process.exit(result.ok ? 0 : 1);
    });

  // `coterie` IS `coterie chat`: the conversational REPL is the product, so a bare
  // invocation (or one with only chat-style flags, e.g. `coterie --mode debate`)
  // defaults to `chat`. Explicit subcommands (`run`, `doctor`, `chat`) and the
  // help/version flags still route normally; a leading bare word that isn't a
  // command falls through so commander reports it as an unknown command (rather
  // than being silently swallowed as a chat default).
  const userArgs = process.argv.slice(2);
  const first = userArgs[0];
  const isHelpOrVersion = (a: string) =>
    a === "-h" || a === "--help" || a === "-V" || a === "--version";
  if (userArgs.length === 0) {
    userArgs.unshift("chat");
  } else if (first !== undefined && first.startsWith("-") && !isHelpOrVersion(first)) {
    // Leading flag with no subcommand: the program has no top-level options, so
    // it's a chat invocation (help/version, which the program itself answers,
    // are excluded above).
    userArgs.unshift("chat");
  }

  await program.parseAsync(userArgs, { from: "user" });
}

main().catch((e) => {
  // Friendly one-line errors for a CLI; full stack only when DEBUG is set.
  console.error(kleur.red(e instanceof Error ? e.message : String(e)));
  if (process.env.DEBUG && e instanceof Error) console.error(e.stack);
  process.exit(1);
});
