#!/usr/bin/env node
import { Command } from "commander";
import kleur from "kleur";

import { loadConfig } from "./config.js";
import { buildGraph } from "./graph.js";

const program = new Command();

program
  .name("coterie")
  .description("Orchestrate heterogeneous coding agents via LangGraph.")
  .version("0.0.1");

program
  .command("run")
  .argument("<task>", "Task to run through the agent graph")
  .requiredOption("--config <path>", "Path to a coterie.yaml config")
  .option("--workdir <path>", "Working directory", ".")
  .action(async (task: string, opts: { config: string; workdir: string }) => {
    const cfg = loadConfig(opts.config);
    const first = cfg.agents[0];
    if (!first) {
      console.error(kleur.red("no agents in config"));
      process.exit(1);
    }
    const graph = buildGraph({
      agentId: first.id,
      adapterKind: first.adapter,
      workdir: opts.workdir,
    });

    console.log(kleur.cyan().bold(`— coterie · ${first.id} (${first.adapter}) —`));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const final: any = await graph.invoke({
      task,
      plan: [],
      current_step_idx: 0,
      runs: [],
      artifacts: {},
      last_winner: null,
      status: "planning",
      config: cfg as unknown as Record<string, unknown>,
      spend_usd: 0,
    });

    const last = final.runs?.[final.runs.length - 1];
    if (last) {
      console.log(last.stdout);
      if (last.cost_estimate_usd != null) {
        console.log(kleur.dim(`cost ≈ $${last.cost_estimate_usd.toFixed(4)}`));
      }
    }
    console.log(kleur.bold(`— ${final.status} —`));
    process.exit(final.status === "done" ? 0 : 1);
  });

program.parseAsync(process.argv);
