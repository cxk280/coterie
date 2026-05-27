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

// A bright, distinct color per agent so each one is easy to follow in a round.
// Assigned in first-seen order and stable for the session.
const AGENT_PALETTE: Colorize[] = [kleur.cyan, kleur.green, kleur.yellow, kleur.magenta, kleur.blue, kleur.red];
const agentColors = new Map<string, Colorize>();
function agentColor(agentId: string): Colorize {
  let c = agentColors.get(agentId);
  if (!c) {
    c = AGENT_PALETTE[agentColors.size % AGENT_PALETTE.length]!;
    agentColors.set(agentId, c);
  }
  return c;
}

const ROLE_LABELS: Record<string, string> = {
  "consensus-participant": "participant",
  "tournament-participant": "contender",
};

/** Glyph + color + label for a line. Coordination roles (judge/moderator) and the
 *  finalizer get fixed colors; every actual agent gets its own palette color so
 *  the three agents in a round are visually distinct. */
function roleStyle(role: string, agentId: string): RoleStyle {
  if (role === "finalizer") return { glyph: "✦", color: kleur.green, label: "finalizer" };
  if (role === "judge" || role === "moderator") return { glyph: "⚖", color: kleur.magenta, label: role };
  return { glyph: "◆", color: agentColor(agentId), label: ROLE_LABELS[role] ?? role };
}

function meta(run: AgentRun): string {
  const bits: string[] = [];
  if (run.duration_s) bits.push(`${run.duration_s.toFixed(1)}s`);
  if (run.cost_estimate_usd != null) bits.push(`$${run.cost_estimate_usd.toFixed(4)}`);
  return bits.length ? kleur.dim(`  ${bits.join(" · ")}`) : "";
}

/** Prefix each content line with a colored gutter bar so a block reads as one
 *  unit, attributed to its agent. Content stays the terminal's default color
 *  (bright/legible) rather than dimmed. */
function block(text: string, gutter: Colorize): string {
  const bar = gutter("│");
  return text
    .split("\n")
    .map((l) => `    ${bar} ${l}`)
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
      const { glyph, color, label } = roleStyle(ev.role, ev.agent_id);
      console.log(`  ${color(glyph)} ${kleur.bold(color(label))} ${kleur.dim(`· ${ev.agent_id}`)} ${kleur.dim().italic("· working…")}`);
    };
    // Live activity from inside a run (tool calls, commands, edits), in the agent's
    // own color so concurrent agents (consensus/tournament) stay legible.
    this.onStep = (ev) => {
      if (this.visible) console.log(`      ${kleur.dim(ev.agent_id)} ${agentColor(ev.agent_id)(ev.text)}`);
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
    const { glyph, color, label } = roleStyle(run.role, run.agent_id);
    if (runFailed(run)) {
      console.warn(`  ${kleur.yellow("✗")} ${kleur.bold().yellow(label)} ${kleur.dim(`· ${run.agent_id}`)} ${kleur.yellow(renderFailure(run))}`);
      return;
    }
    if (!this.visible) return;
    if (run.role === "finalizer") {
      const changed = run.files_changed?.length ? kleur.dim(` — edited ${run.files_changed.join(", ")}`) : "";
      console.log(`  ${color(glyph)} ${kleur.bold(color("finalizer"))} ${kleur.dim(`· ${run.agent_id}`)}${meta(run)}${changed}`);
      return;
    }
    console.log(`  ${color(glyph)} ${kleur.bold(color(label))} ${kleur.dim(`· ${run.agent_id}`)}${meta(run)}`);
    console.log(block(renderContribution(run, 800), color));
  }

  /** Surface new judge verdicts from a streamed state snapshot. */
  update(state: { judge_history?: JudgeDecision[] }): void {
    if (!this.visible) return;
    const judges = state.judge_history ?? [];
    while (this.seenJudge < judges.length) {
      const j = judges[this.seenJudge++];
      if (!j) continue;
      console.log(`  ${kleur.magenta("⚖")} ${kleur.magenta().bold("judge")} ${kleur.dim("→")} ${kleur.bold().magenta(j.winner)}`);
      if (j.reason) console.log(block(j.reason, kleur.magenta));
    }
  }
}
