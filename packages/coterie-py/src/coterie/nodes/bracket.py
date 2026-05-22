"""Bracket judge for `tournament` mode.

Two modes:
- `rounds == 1` (default): single N-way ranking. Picks one winner outright.
- `rounds > 1`: bracket elimination. Each round halves the field (rounded down,
  minimum 1). Loops via a state-driven conditional edge in the tournament graph.

State management uses `mode_state`:
- `tournament_round_idx` — incremented each judge call
- `eliminated_participants` — accumulating list of agent_ids that lost their round
- `survivors` — last round's survivors (used to wire the next round's prompts)
- `last_judged_run_count` — index into `runs` so the judge only scores the
  current round, not all historical runs

The judge's LLM call is identical in both modes; only the routing logic differs.
"""

import json
from typing import Any

from coterie.core.llm.base import LLMClient
from coterie.core.state import CoterieState

BRACKET_JUDGE_SYSTEM = """You are an impartial bracket judge for an N-way coding tournament.
You see N attempts at the same task, one per agent. Score each on the configured criteria,
then rank from best to worst.

Return strict JSON only — no prose, no markdown:
{
  "ranking": [{"agent_id": "...", "score": <int 1-100>, "reason": "<one sentence>"}, ...],
  "winner": "<agent_id>",
  "summary": "<2-3 sentences>"
}
"""


def _rank_current_round(
    llm: LLMClient | None,
    task: str,
    attempts: list[dict],
    criteria: list[str],
) -> dict:
    """Returns dict with ranking, winner, summary. Falls back to cheapest-successful when no LLM."""
    if not llm:
        successful = [a for a in attempts if a["exit_code"] == 0]
        chosen = min(
            successful or attempts,
            key=lambda a: a.get("cost_estimate_usd") or float("inf"),
        )
        return {
            "ranking": [],
            "winner": chosen["agent_id"],
            "summary": "no judge LLM configured; chose cheapest successful attempt",
        }

    attempts_block = "\n\n".join(
        f"--- {a['agent_id']} ---\n"
        f"exit_code: {a['exit_code']}, duration_s: {a['duration_s']:.2f}, "
        f"cost: ${a.get('cost_estimate_usd')}\n"
        f"stdout (first 1500 chars):\n{a['stdout'][:1500]}"
        for a in attempts
    )
    prompt = (
        f"Task: {task}\n\n"
        f"Criteria (priority order): {criteria}\n\n"
        f"Attempts:\n{attempts_block}"
    )
    raw = llm.chat(BRACKET_JUDGE_SYSTEM, [{"role": "user", "content": prompt}])
    try:
        decision = json.loads(raw)
        return {
            "ranking": decision.get("ranking", []),
            "winner": decision["winner"],
            "summary": decision.get("summary", ""),
        }
    except (json.JSONDecodeError, KeyError):
        successful = [a for a in attempts if a["exit_code"] == 0]
        chosen = min(
            successful or attempts,
            key=lambda a: a.get("cost_estimate_usd") or float("inf"),
        )
        return {
            "ranking": [],
            "winner": chosen["agent_id"],
            "summary": f"bracket judge output unparseable: {raw[:120]!r}",
        }


def make_bracket_judge_node(llm: LLMClient | None = None):
    def judge(state: CoterieState) -> dict[str, Any]:
        cfg = state["config"]
        tournament = cfg.get("tournament") or {}
        judge_cfg = tournament.get("judge") or {}
        criteria = judge_cfg.get("criteria") or ["correctness", "minimal-diff", "tests-pass", "clarity"]
        participants_all = tournament.get("participants") or []
        total_rounds = tournament.get("rounds", 1)

        mode_state = dict(state.get("mode_state") or {})
        round_idx = mode_state.get("tournament_round_idx", 0)
        eliminated = list(mode_state.get("eliminated_participants") or [])
        last_count = mode_state.get("last_judged_run_count", 0)

        # Score only this round's runs.
        all_runs = state.get("runs") or []
        this_round = [
            r
            for r in all_runs[last_count:]
            if r.get("role") == "tournament-participant"
            and r["agent_id"] in participants_all
            and r["agent_id"] not in eliminated
        ]

        if not this_round:
            return {"status": "failed"}

        decision = _rank_current_round(llm, state["task"], this_round, criteria)
        winner_id = decision["winner"]
        ranking = decision["ranking"]
        summary = decision["summary"]

        # Determine survivors. Single-round (rounds=1): winner only. Multi-round:
        # top half (rounded down, minimum 1).
        round_idx += 1
        if total_rounds == 1 or len(this_round) <= 2:
            survivors = [winner_id]
            new_eliminated = eliminated + [a["agent_id"] for a in this_round if a["agent_id"] != winner_id]
        else:
            survivors_n = max(1, len(this_round) // 2)
            # Use ranking if available; else fall back to {winner first, rest in input order}.
            if ranking:
                ordered = [r["agent_id"] for r in ranking if r.get("agent_id")]
            else:
                ordered = [winner_id] + [a["agent_id"] for a in this_round if a["agent_id"] != winner_id]
            survivors = ordered[:survivors_n]
            new_eliminated = eliminated + [a for a in ordered if a not in survivors]

        mode_state["tournament_round_idx"] = round_idx
        mode_state["eliminated_participants"] = new_eliminated
        mode_state["survivors"] = survivors
        mode_state["last_judged_run_count"] = len(all_runs)
        mode_state["bracket_ranking"] = ranking
        mode_state["bracket_summary"] = summary

        # Terminate when one survivor remains or we've consumed all rounds.
        done = len(survivors) <= 1 or round_idx >= total_rounds
        if done:
            mode_state["winner"] = survivors[0] if survivors else winner_id

        return {
            "mode_state": mode_state,
            "judge_history": [
                {
                    "step": state.get("current_step_idx", 0),
                    "winner": winner_id,
                    "reason": summary,
                    "scores": {
                        entry.get("agent_id", ""): entry.get("score", 0) for entry in ranking
                    },
                }
            ],
            "status": "done" if done else "tournament_round",
        }

    return judge
