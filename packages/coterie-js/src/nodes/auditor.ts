import type { LLMClient } from "../core/llm/base.js";
import type { CoterieState } from "../core/state.js";

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
  let cleaned = stdout.trim();
  if (cleaned.startsWith("```")) {
    const lines = cleaned.split("\n");
    const last = lines[lines.length - 1];
    cleaned = (last && last.startsWith("```") ? lines.slice(1, -1) : lines.slice(1)).join("\n");
  }
  try {
    const data = JSON.parse(cleaned);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
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
      return {
        mode_state: modeState,
        judge_history: [{
          step: state.current_step_idx ?? 0,
          winner: "implementer",
          reason: "no findings met severity threshold",
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
      try {
        const decision = JSON.parse(raw);
        sustained = (decision.sustained ?? []).map((i: number) => findings[i]).filter(Boolean);
        verdict = decision.verdict ?? "revise";
        reason = decision.reason ?? "";
      } catch {
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

    return {
      mode_state: modeState,
      judge_history: [{
        step: state.current_step_idx ?? 0,
        winner: verdict === "accept" ? "implementer" : "auditor",
        reason,
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
  return AUDITOR_PROMPT_TEMPLATE
    .replace("{subtask}", state.task)
    .replace("{implementer_output}", implOutput.slice(0, 4000));
}

export function makeRecordImplementerOutputNode() {
  return async (state: CoterieState) => {
    const runs = state.runs ?? [];
    const lastImpl = [...runs].reverse().find((r) => r.role === "implementer");
    const modeState = { ...(state.mode_state ?? {}) };
    if (lastImpl) modeState.implementer_output = lastImpl.stdout;
    return { mode_state: modeState, status: "auditing" as const };
  };
}

export function makeRecordAuditorFindingsNode() {
  return async (state: CoterieState) => {
    const runs = state.runs ?? [];
    const lastAuditor = [...runs].reverse().find((r) => r.role === "auditor");
    const modeState = { ...(state.mode_state ?? {}) };
    if (lastAuditor) modeState.auditor_findings = parseFindings(lastAuditor.stdout);
    return { mode_state: modeState, status: "judging" as const };
  };
}
