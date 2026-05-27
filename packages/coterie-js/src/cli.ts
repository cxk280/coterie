#!/usr/bin/env node
/** Composition root. Picks LLM provider per role + executor. */

import { Command } from "commander";
import kleur from "kleur";

import { renderFailure, runFailed } from "./chat/render.js";
import { loadConfig } from "./config.js";
import { IsolatedWorktreeExecutor, LocalSubprocessExecutor, type AdapterExecutor } from "./core/executor.js";
import type { LLMClient } from "./core/llm/base.js";
import { buildLLM } from "./core/llm/build.js";
import { buildGraph } from "./graph.js";

import "./adapters/index.js";  // trigger adapter registration
import "./modes/index.js";     // trigger mode registration

function buildExecutor(cfg: any): AdapterExecutor {
  const explicit = cfg.executor?.kind;
  if (explicit === "local") return new LocalSubprocessExecutor();
  if (explicit === "isolated") return new IsolatedWorktreeExecutor();
  if (cfg.mode === "consensus" || cfg.mode === "tournament") return new IsolatedWorktreeExecutor();
  return new LocalSubprocessExecutor();
}

async function main() {
  const program = new Command();
  program.name("coterie").description("Multi-mode LangGraph orchestration for heterogeneous coding agents.").version("0.1.0");

  program
    .command("run")
    .argument("<task>", "Task to run through the agent graph")
    .requiredOption("--config <path>", "Path to a coterie.yaml config")
    .option("--workdir <path>", "Working directory", ".")
    .action(async (task: string, opts: { config: string; workdir: string }) => {
      const cfg = loadConfig(opts.config);
      const mode = cfg.mode;
      const executor = buildExecutor(cfg);

      const llms: Record<string, LLMClient | null> = {
        supervisor_llm: mode === "single" ? await buildLLM(cfg.router?.model) : null,
        judge_llm: ["adversarial", "tournament", "debate"].includes(mode)
          ? await buildLLM(cfg[mode]?.judge?.model)
          : null,
        consensus_llm: mode === "consensus" ? await buildLLM(cfg.consensus?.engine?.model) : null,
        moderator_llm: mode === "debate" ? await buildLLM(cfg.debate?.moderator?.model) : null,
        planner_llm: cfg.planner?.enabled ? await buildLLM(cfg.planner?.model) : null,
      };

      const graph = buildGraph({ workdir: opts.workdir, executor, config: cfg, ...llms });
      console.log(kleur.cyan().bold(`— coterie · mode=${mode} · ${cfg.agents.length} agents —`));

      const initial = {
        task, mode, plan: [], current_step_idx: 0, runs: [], artifacts: {},
        status: "planning", config: cfg, spend_usd: 0, route_history: [],
        judge_history: [], next_agent: null, mode_state: {},
      };
      const final: any = await graph.invoke(initial);
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
    .option("--mode <mode>", "Coordination mode (single|consensus|adversarial|debate|tournament)", "adversarial")
    .option("--workdir <path>", "Directory the agents read/edit", ".")
    .option("--quiet", "Start with the live agent exchanges hidden (show only the final reply)", false)
    .action(async (opts: { mode: string; workdir: string; quiet: boolean }) => {
      const { runChat } = await import("./chat/repl.js");
      const valid = ["single", "consensus", "adversarial", "debate", "tournament"];
      if (!valid.includes(opts.mode)) {
        console.error(`unknown mode '${opts.mode}'; pick one of ${valid.join(", ")}`);
        process.exit(2);
      }
      await runChat({ mode: opts.mode as any, workdir: opts.workdir, quiet: opts.quiet });
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

  await program.parseAsync(process.argv);
}

main().catch((e) => {
  // Friendly one-line errors for a CLI; full stack only when DEBUG is set.
  console.error(kleur.red(e instanceof Error ? e.message : String(e)));
  if (process.env.DEBUG && e instanceof Error) console.error(e.stack);
  process.exit(1);
});
