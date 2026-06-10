/** The adversarial mode's nodes: prompts for the implementer/auditor seats,
 *  recorder nodes that lift their outputs into mode_state, and the judge that
 *  sustains/rejects findings and decides accept vs another round.
 *  Wired into a graph by modes/adversarial.ts. */

import { parseJsonLoose } from "../core/json.js";
import type { LLMClient } from "../core/llm/base.js";
import { type CoterieState, lastRunByRole } from "../core/state.js";

export const AUDITOR_PROMPT_TEMPLATE = `You are an adversarial code auditor. The implementer below produced this work for the subtask:

# Subtask
{subtask}

# Implementer's output
{implementer_output}

Find every plausible defect: bugs, edge cases missed, perf problems, security issues,
missed requirements, unclear code, undocumented invariants. Be aggressive but precise.

Return ONLY a JSON array. No prose, no markdown. Each finding:
{
  "category": "bug|perf|security|clarity|missed-requirement|edge-case",
  "severity": "low|medium|high|critical",
  "description": "<one sentence>",
  "line_ranges": ["path:start-end", ...]
}

If you find no defects, return [].
`;

const JUDGE_SYSTEM = `You are an impartial judge in an adversarial code review.
You see an implementation and an auditor's findings. Decide which findings are
sustained (real defects the implementer should fix) versus rejected (nitpicks,
false positives, or out of scope).

Sustain a finding when: (1) it identifies a real defect, (2) its severity meets or
exceeds the configured sustain_threshold, AND (3) it is in scope for the subtask.

Return strict JSON only — no prose, no markdown:
{
  "sustained": [<finding_indices>],
  "rejected": [<finding_indices>],
  "verdict": "accept" | "revise",
  "reason": "<2-3 sentences>"
}`;

const SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

export function parseFindings(stdout: string): any[] {
  const data = parseJsonLoose(stdout);
  return Array.isArray(data) ? data : [];
}

/** Whether the auditor output actually yielded a JSON array of findings — as
 *  opposed to prose, a crash, or malformed JSON. Lets the judge distinguish a
 *  genuine "no defects" ([]) from "couldn't read the auditor", which must not be
 *  silently treated as a clean bill of health. */
export function findingsAreParseable(stdout: string): boolean {
  return Array.isArray(parseJsonLoose(stdout));
}

export function makeAdversarialJudgeNode(llm: LLMClient | null) {
  return async (state: CoterieState) => {
    const cfg = state.config;
    const adv = cfg.adversarial;
    const judgeCfg = adv.judge ?? {};
    const threshold = judgeCfg.sustain_threshold ?? "medium";
    const minRank = SEVERITY_RANK[threshold] ?? 2;
    const maxRounds = adv.max_rounds ?? 2;

    const modeState = { ...(state.mode_state ?? {}) };
    const findings = (modeState.auditor_findings ?? []) as any[];
    const implOutput = (modeState.implementer_output ?? "") as string;
    const roundIdx = (modeState.round_idx ?? 0) as number;

    const eligibleIndices = findings
      .map((f, i) => [i, f] as const)
      .filter(([, f]) => (SEVERITY_RANK[f.severity ?? "low"] ?? 1) >= minRank)
      .map(([i]) => i);

    if (eligibleIndices.length === 0) {
      modeState.sustained_findings = [];
      modeState.verdict = "accept";
      // If the auditor's output couldn't be parsed (crash / prose / bad JSON),
      // "no eligible findings" doesn't mean "clean" — say so rather than implying
      // a pass. (We still terminate; the failure is surfaced in the trace.)
      const unparsed = modeState.auditor_unparsed === true;
      return {
        mode_state: modeState,
        judge_history: [{
          step: state.current_step_idx ?? 0,
          winner: "implementer",
          reason: unparsed
            ? "auditor produced no parseable findings — accepting, but the audit may be incomplete"
            : "no findings met severity threshold",
          scores: { sustained_count: 0 },
        }],
        status: "done" as const,
      };
    }

    let sustained: any[];
    let verdict: string;
    let reason: string;
    if (!llm) {
      sustained = eligibleIndices.map((i) => findings[i]);
      verdict = "revise";
      reason = "no judge LLM configured; conservatively sustaining all eligible findings";
    } else {
      const findingsBlock = eligibleIndices.map((i) =>
        `[${i}] severity=${findings[i].severity} category=${findings[i].category}: ${findings[i].description}`
      ).join("\n");
      const prompt =
        `Subtask: ${state.task}\n\n` +
        `Implementation output:\n${implOutput.slice(0, 2000)}\n\n` +
        `Eligible findings (severity >= ${threshold}):\n${findingsBlock}\n\n` +
        `Round: ${roundIdx + 1} of ${maxRounds}`;
      const raw = await llm.chat(JUDGE_SYSTEM, [{ role: "user", content: prompt }]);
      const decision = parseJsonLoose(raw);
      if (decision && typeof decision === "object") {
        sustained = (decision.sustained ?? []).map((i: number) => findings[i]).filter(Boolean);
        verdict = decision.verdict ?? "revise";
        reason = decision.reason ?? "";
      } else {
        sustained = eligibleIndices.map((i) => findings[i]);
        verdict = "revise";
        reason = `judge LLM output unparseable: ${raw.slice(0, 120)}`;
      }
    }

    modeState.sustained_findings = sustained;
    modeState.verdict = verdict;
    modeState.round_idx = roundIdx + 1;
    const outOfRounds = modeState.round_idx >= maxRounds;
    const finished = verdict === "accept" || outOfRounds || sustained.length === 0;
    // Surface the honest outcome: hitting the round cap with sustained defects
    // still outstanding is "done with unresolved issues", not a clean accept.
    const unresolved = finished && verdict !== "accept" && sustained.length > 0;
    modeState.unresolved_findings = unresolved ? sustained.length : 0;

    return {
      mode_state: modeState,
      judge_history: [{
        step: state.current_step_idx ?? 0,
        winner: verdict === "accept" ? "implementer" : "auditor",
        reason: unresolved ? `${reason} (round cap reached with ${sustained.length} unresolved)` : reason,
        scores: { sustained_count: sustained.length },
      }],
      status: finished ? ("done" as const) : ("executing" as const),
    };
  };
}

export function adversarialImplementerPrompt(state: CoterieState): string {
  const ms = state.mode_state ?? {};
  const round = ms.round_idx ?? 0;
  if (round === 0) return state.task;
  const sustained = (ms.sustained_findings ?? []) as any[];
  const critiques = sustained.map((f) => `- [${f.severity}] ${f.description}`).join("\n");
  return `${state.task}\n\nPrevious round had sustained critiques. Please address each:\n${critiques}`;
}

export function adversarialAuditorPrompt(state: CoterieState): string {
  const ms = state.mode_state ?? {};
  const implOutput = (ms.implementer_output ?? "") as string;
  // Single-pass substitution so a user task containing the literal
  // "{implementer_output}" can't collide with the second placeholder.
  const subs: Record<string, string> = {
    "{subtask}": state.task,
    "{implementer_output}": implOutput.slice(0, 4000),
  };
  return AUDITOR_PROMPT_TEMPLATE.replace(/\{subtask\}|\{implementer_output\}/g, (m) => subs[m] ?? m);
}

export function makeRecordImplementerOutputNode() {
  return async (state: CoterieState) => {
    const lastImpl = lastRunByRole(state.runs, "implementer");
    const modeState = { ...(state.mode_state ?? {}) };
    if (lastImpl) modeState.implementer_output = lastImpl.stdout;
    return { mode_state: modeState, status: "auditing" as const };
  };
}

export function makeRecordAuditorFindingsNode() {
  return async (state: CoterieState) => {
    const lastAuditor = lastRunByRole(state.runs, "auditor");
    const modeState = { ...(state.mode_state ?? {}) };
    if (lastAuditor) {
      modeState.auditor_findings = parseFindings(lastAuditor.stdout);
      // Distinguish a real "[]" (clean) from a crash / prose / bad JSON, so the
      // judge doesn't read a broken audit as a pass.
      modeState.auditor_unparsed =
        lastAuditor.exit_code !== 0 || !findingsAreParseable(lastAuditor.stdout);
    }
    return { mode_state: modeState, status: "judging" as const };
  };
}
