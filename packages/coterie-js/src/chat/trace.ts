/** Compact, hideable live trace of a coordination round, fed the full-state
 *  snapshots from `graph.stream(..., { streamMode: "values" })`. */

import kleur from "kleur";

import type { AgentRun, JudgeDecision } from "../core/state.js";

export class Trace {
  private seenRuns = 0;
  private seenJudge = 0;

  constructor(public visible: boolean) {}

  reset(): void {
    this.seenRuns = 0;
    this.seenJudge = 0;
  }

  /** Emit a line for each new agent run / judge verdict in the latest snapshot. */
  update(state: { runs?: AgentRun[]; judge_history?: JudgeDecision[] }): void {
    if (!this.visible) return;
    const runs = state.runs ?? [];
    while (this.seenRuns < runs.length) {
      const r = runs[this.seenRuns++];
      if (!r) continue;
      const cost = r.cost_estimate_usd != null ? ` · $${r.cost_estimate_usd.toFixed(4)}` : "";
      console.log(kleur.dim(`  · ${r.role} (${r.agent_id})${cost}`));
    }
    const judges = state.judge_history ?? [];
    while (this.seenJudge < judges.length) {
      const j = judges[this.seenJudge++];
      if (!j) continue;
      console.log(kleur.dim(`  · judge → ${j.winner}${j.reason ? `: ${j.reason}` : ""}`));
    }
  }
}
