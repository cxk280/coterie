/** Live trace of a coordination round, fed the full-state snapshots from
 *  `graph.stream(..., { streamMode: "values" })`. By default it logs each agent's
 *  actual contribution (the exchange), not just who ran; `visible=false` (via
 *  `--quiet` / `/hide`) silences it and you get only the final answer. */

import kleur from "kleur";

import type { AgentRun, JudgeDecision } from "../core/state.js";
import { renderContribution, renderFailure, runFailed } from "./render.js";

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
   *  new judge verdict. Agent *failures* surface even when the trace is hidden —
   *  a silent failure is worse than a noisy one. */
  update(state: { runs?: AgentRun[]; judge_history?: JudgeDecision[] }): void {
    const runs = state.runs ?? [];
    while (this.seenRuns < runs.length) {
      const r = runs[this.seenRuns++];
      if (!r) continue;
      if (runFailed(r)) {
        console.warn(kleur.yellow(`  ⚠ ${r.role} (${r.agent_id}) ${renderFailure(r)}`));
      } else if (this.visible) {
        const cost = r.cost_estimate_usd != null ? ` · $${r.cost_estimate_usd.toFixed(4)}` : "";
        console.log(kleur.dim(`  · ${r.role} (${r.agent_id})${cost}`));
        console.log(kleur.dim(indent(renderContribution(r))));
      }
    }
    if (!this.visible) return;
    const judges = state.judge_history ?? [];
    while (this.seenJudge < judges.length) {
      const j = judges[this.seenJudge++];
      if (!j) continue;
      console.log(kleur.dim(`  · judge → ${j.winner}${j.reason ? `: ${j.reason}` : ""}`));
    }
  }

  /** Log the finalizer step. A finalizer failure is surfaced always (it's the
   *  source of the answer and the edits); a success line only when visible. */
  finalizer(run: AgentRun): void {
    if (runFailed(run)) {
      console.warn(kleur.yellow(`  ⚠ finalizer (${run.agent_id}) ${renderFailure(run)}`));
      return;
    }
    if (!this.visible) return;
    const cost = run.cost_estimate_usd != null ? ` · $${run.cost_estimate_usd.toFixed(4)}` : "";
    const changed = run.files_changed?.length
      ? ` — edited ${run.files_changed.join(", ")}`
      : "";
    console.log(kleur.dim(`  · finalizer (${run.agent_id})${cost}${changed}`));
  }
}
