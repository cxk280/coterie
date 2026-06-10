/** The debate mode's coordination nodes: a moderator that summarizes each pro/con
 *  round, and a judge that scores the full transcript and picks the winner.
 *  Wired into a graph by modes/debate.ts. */

import { parseJsonLoose } from "../core/json.js";
import type { LLMClient } from "../core/llm/base.js";
import { type CoterieState, lastRunByRole } from "../core/state.js";

const MODERATOR_SYSTEM = `You are an impartial debate moderator.
Given the latest Pro and Con arguments, produce a concise round summary and identify
the strongest unresolved disagreement. Return strict JSON only:
{
  "round_summary": "<2-3 sentences>",
  "unresolved": "<the strongest open disagreement>",
  "fact_check_needed": ["<claim>", ...]
}`;

const DEBATE_JUDGE_SYSTEM = `You are an impartial debate judge.
You see N rounds of Pro and Con arguments on a single question. Pick the stronger
position based on: evidence quality, logical coherence, addressing the opponent's strongest points,
and practical applicability.

Return strict JSON only:
{
  "winner": "pro" | "con" | "tie",
  "reason": "<3-4 sentences>",
  "scores": {"pro": <int 1-10>, "con": <int 1-10>}
}`;

export function makeModeratorNode(llm: LLMClient | null) {
  return async (state: CoterieState) => {
    const modeState = { ...(state.mode_state ?? {}) };
    const proRun = lastRunByRole(state.runs, "pro");
    const conRun = lastRunByRole(state.runs, "con");
    if (!proRun || !conRun) return { mode_state: modeState };

    let summary: any;
    if (!llm) {
      summary = { round_summary: "no moderator LLM configured", unresolved: "", fact_check_needed: [] };
    } else {
      const prompt =
        `Question: ${state.task}\n\nPro argument:\n${proRun.stdout.slice(0, 1500)}\n\n` +
        `Con argument:\n${conRun.stdout.slice(0, 1500)}`;
      const raw = await llm.chat(MODERATOR_SYSTEM, [{ role: "user", content: prompt }]);
      summary = parseJsonLoose(raw) ?? { round_summary: raw.slice(0, 300), unresolved: "", fact_check_needed: [] };
    }

    modeState.rounds_completed = (modeState.rounds_completed ?? 0) + 1;
    modeState.round_summaries = [...(modeState.round_summaries ?? []), summary];
    return { mode_state: modeState };
  };
}

export function makeDebateJudgeNode(llm: LLMClient | null) {
  return async (state: CoterieState) => {
    const cfg = state.config;
    const sides = (cfg.debate?.sides ?? []) as [string, string];
    const runs = state.runs ?? [];
    const proRuns = runs.filter((r) => r.role === "pro");
    const conRuns = runs.filter((r) => r.role === "con");
    // Pair by the longer side so a dropped/failed round on either side isn't
    // silently omitted from the judged transcript.
    const rounds = Math.max(proRuns.length, conRuns.length);
    const transcript = Array.from({ length: rounds }, (_, i) => {
      const pro = proRuns[i];
      const con = conRuns[i];
      return `Round ${i + 1}\nPRO: ${pro ? pro.stdout.slice(0, 800) : "(missing)"}\nCON: ${con ? con.stdout.slice(0, 800) : "(missing)"}`;
    }).join("\n\n");

    let decision: any;
    if (!llm) {
      decision = { winner: "tie", reason: "no judge LLM configured", scores: {} };
    } else {
      const raw = await llm.chat(DEBATE_JUDGE_SYSTEM, [
        { role: "user", content: `Question: ${state.task}\n\n${transcript}` },
      ]);
      decision = parseJsonLoose(raw) ?? { winner: "tie", reason: `judge output unparseable: ${raw.slice(0, 120)}`, scores: {} };
    }

    const winnerLabel = decision.winner ?? "tie";
    const winnerAgent = winnerLabel === "pro" ? sides[0] : winnerLabel === "con" ? sides[1] : "tie";
    return {
      mode_state: { ...(state.mode_state ?? {}), debate_verdict: decision },
      judge_history: [{
        step: state.current_step_idx ?? 0,
        winner: winnerAgent,
        reason: decision.reason ?? "",
        scores: decision.scores ?? {},
      }],
      status: "done" as const,
    };
  };
}
