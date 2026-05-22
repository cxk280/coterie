import type { LLMClient } from "../core/llm/base.js";
import type { CoterieState } from "../core/state.js";

const BRACKET_JUDGE_SYSTEM = `You are an impartial bracket judge for an N-way coding tournament.
You see N attempts at the same task, one per agent. Score each on the configured criteria,
then rank from best to worst.

Return strict JSON only — no prose, no markdown:
{
  "ranking": [{"agent_id": "...", "score": <int 1-100>, "reason": "<one sentence>"}, ...],
  "winner": "<agent_id>",
  "summary": "<2-3 sentences>"
}`;

async function rankCurrentRound(
  llm: LLMClient | null,
  task: string,
  attempts: any[],
  criteria: string[],
): Promise<{ ranking: any[]; winner: string; summary: string }> {
  if (!llm) {
    const successful = attempts.filter((a) => a.exit_code === 0);
    const pool = successful.length ? successful : attempts;
    const chosen = pool.reduce((a, b) =>
      (a.cost_estimate_usd ?? Infinity) <= (b.cost_estimate_usd ?? Infinity) ? a : b,
    );
    return { ranking: [], winner: chosen.agent_id, summary: "no judge LLM; chose cheapest" };
  }

  const block = attempts
    .map((a) =>
      `--- ${a.agent_id} ---\nexit_code: ${a.exit_code}, duration_s: ${a.duration_s.toFixed(2)}, cost: $${a.cost_estimate_usd}\n` +
      `stdout (first 1500 chars):\n${a.stdout.slice(0, 1500)}`,
    )
    .join("\n\n");
  const prompt = `Task: ${task}\n\nCriteria (priority order): ${JSON.stringify(criteria)}\n\nAttempts:\n${block}`;
  const raw = await llm.chat(BRACKET_JUDGE_SYSTEM, [{ role: "user", content: prompt }]);
  try {
    const d = JSON.parse(raw);
    return { ranking: d.ranking ?? [], winner: d.winner, summary: d.summary ?? "" };
  } catch {
    const successful = attempts.filter((a) => a.exit_code === 0);
    const pool = successful.length ? successful : attempts;
    const chosen = pool.reduce((a, b) =>
      (a.cost_estimate_usd ?? Infinity) <= (b.cost_estimate_usd ?? Infinity) ? a : b,
    );
    return { ranking: [], winner: chosen.agent_id, summary: `bracket judge unparseable: ${raw.slice(0, 120)}` };
  }
}

export function makeBracketJudgeNode(llm: LLMClient | null) {
  return async (state: CoterieState) => {
    const cfg = state.config;
    const tournament = cfg.tournament ?? {};
    const judgeCfg = tournament.judge ?? {};
    const criteria = judgeCfg.criteria ?? ["correctness", "minimal-diff", "tests-pass", "clarity"];
    const participantsAll = (tournament.participants ?? []) as string[];
    const totalRounds = tournament.rounds ?? 1;

    const modeState = { ...(state.mode_state ?? {}) };
    let roundIdx = (modeState.tournament_round_idx ?? 0) as number;
    const eliminated = [...(modeState.eliminated_participants ?? [])] as string[];
    const lastCount = (modeState.last_judged_run_count ?? 0) as number;

    const allRuns = state.runs ?? [];
    const thisRound = allRuns
      .slice(lastCount)
      .filter((r) => r.role === "tournament-participant" && participantsAll.includes(r.agent_id) && !eliminated.includes(r.agent_id));

    if (thisRound.length === 0) return { status: "failed" as const };

    const { ranking, winner, summary } = await rankCurrentRound(llm, state.task, thisRound, criteria);
    roundIdx += 1;

    let survivors: string[];
    let newEliminated: string[];
    if (totalRounds === 1 || thisRound.length <= 2) {
      survivors = [winner];
      newEliminated = [...eliminated, ...thisRound.filter((a) => a.agent_id !== winner).map((a) => a.agent_id)];
    } else {
      const survivorsN = Math.max(1, Math.floor(thisRound.length / 2));
      const ordered = ranking.length
        ? ranking.map((r) => r.agent_id).filter(Boolean)
        : [winner, ...thisRound.filter((a) => a.agent_id !== winner).map((a) => a.agent_id)];
      survivors = ordered.slice(0, survivorsN);
      newEliminated = [...eliminated, ...ordered.filter((a) => !survivors.includes(a))];
    }

    modeState.tournament_round_idx = roundIdx;
    modeState.eliminated_participants = newEliminated;
    modeState.survivors = survivors;
    modeState.last_judged_run_count = allRuns.length;
    modeState.bracket_ranking = ranking;
    modeState.bracket_summary = summary;
    const done = survivors.length <= 1 || roundIdx >= totalRounds;
    if (done) modeState.winner = survivors[0] ?? winner;

    return {
      mode_state: modeState,
      judge_history: [{
        step: state.current_step_idx ?? 0,
        winner,
        reason: summary,
        scores: Object.fromEntries(ranking.map((r) => [r.agent_id, r.score ?? 0])),
      }],
      status: done ? ("done" as const) : ("tournament_round" as const),
    };
  };
}
