/** Live trace of a coordination round, fed the full-state snapshots from
 *  `graph.stream(..., { streamMode: "values" })`. By default it logs each agent's
 *  actual contribution (the exchange), not just who ran; `visible=false` (via
 *  `--quiet` / `/hide`) silences it and you get only the final answer. */

import kleur from "kleur";

import type { AgentRun, JudgeDecision } from "../core/state.js";
import { renderContribution } from "./render.js";

function indent(text: string, pad = "      "): string {
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

export class Trace {
  private seenRuns = 0;
  private seenJudge = 0;

  constructor(public visible: boolean) {}

  reset(): void {
    this.seenRuns = 0;
    this.seenJudge = 0;
  }

  /** Emit a header + the rendered contribution for each new agent run, and each
   *  new judge verdict, in the latest snapshot. */
  update(state: { runs?: AgentRun[]; judge_history?: JudgeDecision[] }): void {
    if (!this.visible) return;
    const runs = state.runs ?? [];
    while (this.seenRuns < runs.length) {
      const r = runs[this.seenRuns++];
      if (!r) continue;
      const cost = r.cost_estimate_usd != null ? ` · $${r.cost_estimate_usd.toFixed(4)}` : "";
      console.log(kleur.dim(`  · ${r.role} (${r.agent_id})${cost}`));
      console.log(kleur.dim(indent(renderContribution(r))));
    }
    const judges = state.judge_history ?? [];
    while (this.seenJudge < judges.length) {
      const j = judges[this.seenJudge++];
      if (!j) continue;
      console.log(kleur.dim(`  · judge → ${j.winner}${j.reason ? `: ${j.reason}` : ""}`));
    }
  }

  /** Log the finalizer step — the answer prints separately, so show only what it
   *  changed in the workdir. */
  finalizer(run: AgentRun): void {
    if (!this.visible) return;
    const cost = run.cost_estimate_usd != null ? ` · $${run.cost_estimate_usd.toFixed(4)}` : "";
    const changed = run.files_changed?.length
      ? ` — edited ${run.files_changed.join(", ")}`
      : "";
    console.log(kleur.dim(`  · finalizer (${run.agent_id})${cost}${changed}`));
  }
}
