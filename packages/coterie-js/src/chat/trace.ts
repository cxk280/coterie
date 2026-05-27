/** Live, elegant trace of a coordination round. Per-agent activity is driven by
 *  the process-wide progress bus (`core/progress`): each agent emits `start` when
 *  it begins and `done` when it finishes, so the back-and-forth streams live even
 *  when a mode fans agents out concurrently (e.g. consensus). Judge verdicts come
 *  from the graph's streamed state snapshots. Everything is shown by default;
 *  `visible=false` (via `--quiet` / `/hide`) silences the commentary — but agent
 *  *failures* surface regardless, since a silent failure is worse than a noisy one. */

import kleur from "kleur";

import { progress, type AgentDoneEvent, type AgentStartEvent, type AgentStepEvent } from "../core/progress.js";
import type { AgentRun, JudgeDecision } from "../core/state.js";
import { renderContribution, renderFailure, runFailed } from "./render.js";

type Colorize = (s: string) => string;

interface RoleStyle {
  glyph: string;
  color: Colorize;
  label: string;
}

/** A consistent glyph + color per role so the eye can follow who's speaking. */
function roleStyle(role: string): RoleStyle {
  switch (role) {
    case "auditor":
    case "con":
      return { glyph: "◆", color: kleur.yellow, label: role };
    case "judge":
    case "moderator":
      return { glyph: "⚖", color: kleur.magenta, label: role };
    case "finalizer":
      return { glyph: "✦", color: kleur.green, label: "finalizer" };
    case "consensus-participant":
      return { glyph: "◆", color: kleur.cyan, label: "participant" };
    case "tournament-participant":
      return { glyph: "◆", color: kleur.cyan, label: "contender" };
    default: // implementer, pro, agent, single, …
      return { glyph: "◆", color: kleur.cyan, label: role };
  }
}

function meta(run: AgentRun): string {
  const bits: string[] = [];
  if (run.duration_s) bits.push(`${run.duration_s.toFixed(1)}s`);
  if (run.cost_estimate_usd != null) bits.push(`$${run.cost_estimate_usd.toFixed(4)}`);
  return bits.length ? kleur.dim(`  ${bits.join(" · ")}`) : "";
}

/** Prefix every content line with a soft gutter bar so a block reads as one unit. */
function block(text: string): string {
  const bar = kleur.dim("│");
  return text
    .split("\n")
    .map((l) => `    ${bar} ${kleur.dim(l)}`)
    .join("\n");
}

/** A thin section rule, e.g. `── deliberating · consensus ──────────`. */
export function rule(label: string): string {
  const head = kleur.dim("── ") + kleur.bold().cyan(label) + kleur.dim(" ");
  const visibleLen = 3 + label.length + 1;
  return head + kleur.dim("─".repeat(Math.max(0, 56 - visibleLen)));
}

export class Trace {
  private seenJudge = 0;
  private onStart?: (ev: AgentStartEvent) => void;
  private onDone?: (ev: AgentDoneEvent) => void;
  private onStep?: (ev: AgentStepEvent) => void;

  constructor(public visible: boolean) {}

  /** Subscribe to the progress bus for the lifetime of the session. The handlers
   *  read `this.visible` at emit time, so `/show` / `/hide` take effect live. */
  attach(): void {
    this.onStart = (ev) => {
      if (!this.visible) return;
      const { glyph, color, label } = roleStyle(ev.role);
      console.log(`  ${color(glyph)} ${color(label)} ${kleur.dim(`· ${ev.agent_id}`)} ${kleur.dim().italic("· working…")}`);
    };
    // Live activity from inside a run (tool calls, commands, edits). Tagged with
    // the agent id so concurrent agents (consensus/tournament) stay legible.
    this.onStep = (ev) => {
      if (this.visible) console.log(kleur.dim(`      ${ev.agent_id} ${ev.text}`));
    };
    this.onDone = ({ run }) => this.renderRun(run);
    progress.on("start", this.onStart);
    progress.on("step", this.onStep);
    progress.on("done", this.onDone);
  }

  detach(): void {
    if (this.onStart) progress.off("start", this.onStart);
    if (this.onStep) progress.off("step", this.onStep);
    if (this.onDone) progress.off("done", this.onDone);
  }

  reset(): void {
    this.seenJudge = 0;
  }

  private renderRun(run: AgentRun): void {
    const { glyph, color, label } = roleStyle(run.role);
    if (runFailed(run)) {
      console.warn(`  ${kleur.yellow("✗")} ${kleur.yellow(label)} ${kleur.dim(`· ${run.agent_id}`)} ${kleur.yellow(renderFailure(run))}`);
      return;
    }
    if (!this.visible) return;
    if (run.role === "finalizer") {
      const changed = run.files_changed?.length ? kleur.dim(` — edited ${run.files_changed.join(", ")}`) : "";
      console.log(`  ${color(glyph)} ${kleur.bold(color("finalizer"))} ${kleur.dim(`· ${run.agent_id}`)}${meta(run)}${changed}`);
      return;
    }
    console.log(`  ${color(glyph)} ${kleur.bold(color(label))} ${kleur.dim(`· ${run.agent_id}`)}${meta(run)}`);
    console.log(block(renderContribution(run, 800)));
  }

  /** Surface new judge verdicts from a streamed state snapshot. */
  update(state: { judge_history?: JudgeDecision[] }): void {
    if (!this.visible) return;
    const judges = state.judge_history ?? [];
    while (this.seenJudge < judges.length) {
      const j = judges[this.seenJudge++];
      if (!j) continue;
      console.log(`  ${kleur.magenta("⚖")} ${kleur.magenta().bold("judge")} ${kleur.dim("→")} ${kleur.bold(j.winner)}`);
      if (j.reason) console.log(block(j.reason));
    }
  }
}
