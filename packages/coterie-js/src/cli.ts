#!/usr/bin/env node
/** Composition root. Picks LLM provider per role + executor. */

import { Command } from "commander";
import kleur from "kleur";

import { loadConfig } from "./config.js";
import { IsolatedWorktreeExecutor, LocalSubprocessExecutor, type AdapterExecutor } from "./core/executor.js";
import type { LLMClient } from "./core/llm/base.js";
import { buildGraph } from "./graph.js";

import "./adapters/index.js";  // trigger adapter registration
import "./modes/index.js";     // trigger mode registration

function inferProvider(model?: string): string {
  if (!model) return "anthropic";
  const m = model.toLowerCase();
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  if (m.includes("llama")) return "groq";
  if (m.includes("grok")) return "xai";
  return "anthropic";
}

async function buildLLM(model?: string): Promise<LLMClient | null> {
  const provider = process.env.COTERIE_LLM_PROVIDER ?? inferProvider(model);
  if (provider === "anthropic") {
    const { AnthropicClient } = await import("./core/llm/anthropicClient.js");
    return new AnthropicClient(model);
  }
  if (provider === "openai") {
    const { OpenAIClient } = await import("./core/llm/openaiCompat.js");
    return new OpenAIClient(model);
  }
  if (provider === "groq") {
    const { GroqClient } = await import("./core/llm/openaiCompat.js");
    return new GroqClient(model);
  }
  if (provider === "xai") {
    const { XAIClient } = await import("./core/llm/openaiCompat.js");
    return new XAIClient(model);
  }
  throw new Error(`unknown LLM provider ${provider}`);
}

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
      console.log(kleur.dim(`total spend ≈ $${(final.spend_usd ?? 0).toFixed(4)}`));
      console.log(kleur.bold(`— ${final.status} —`));
      process.exit(final.status === "done" ? 0 : 1);
    });

  await program.parseAsync(process.argv);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
