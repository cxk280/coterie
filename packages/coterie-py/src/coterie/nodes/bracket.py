"""Bracket judge node for `tournament` mode.

v0.1: single-round N-way judging. All participants run on the same task; the
judge ranks them and picks one winner. Multi-round bracket elimination is a v0.1.x
enhancement — the architecture supports it but the wiring is currently flat.
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


def make_bracket_judge_node(llm: LLMClient | None = None):
    def judge(state: CoterieState) -> dict[str, Any]:
        cfg = state["config"]
        tournament = cfg.get("tournament") or {}
        judge_cfg = tournament.get("judge") or {}
        criteria = judge_cfg.get("criteria") or [
            "correctness",
            "minimal-diff",
            "tests-pass",
            "clarity",
        ]
        participants = tournament.get("participants") or []

        attempts = [
            r
            for r in state.get("runs") or []
            if r.get("role") == "tournament-participant"
            and r["agent_id"] in participants
        ]

        if not attempts:
            return {"status": "failed"}

        if llm is None:
            # Fall back: cheapest successful attempt (or cheapest if none succeeded).
            successful = [a for a in attempts if a["exit_code"] == 0]
            chosen = min(
                successful or attempts,
                key=lambda a: a.get("cost_estimate_usd") or float("inf"),
            )
            winner_id = chosen["agent_id"]
            ranking: list[dict] = []
            summary = "no judge LLM configured; chose cheapest successful attempt"
        else:
            attempts_block = "\n\n".join(
                f"--- {a['agent_id']} ---\n"
                f"exit_code: {a['exit_code']}, duration_s: {a['duration_s']:.2f}, "
                f"cost: ${a.get('cost_estimate_usd')}\n"
                f"stdout (first 1500 chars):\n{a['stdout'][:1500]}"
                for a in attempts
            )
            prompt = (
                f"Task: {state['task']}\n\n"
                f"Criteria (priority order): {criteria}\n\n"
                f"Attempts:\n{attempts_block}"
            )
            raw = llm.chat(BRACKET_JUDGE_SYSTEM, [{"role": "user", "content": prompt}])
            try:
                decision = json.loads(raw)
                winner_id = decision["winner"]
                ranking = decision.get("ranking", [])
                summary = decision.get("summary", "")
            except (json.JSONDecodeError, KeyError):
                successful = [a for a in attempts if a["exit_code"] == 0]
                chosen = min(
                    successful or attempts,
                    key=lambda a: a.get("cost_estimate_usd") or float("inf"),
                )
                winner_id = chosen["agent_id"]
                ranking = []
                summary = f"bracket judge output unparseable: {raw[:120]!r}"

        mode_state = dict(state.get("mode_state") or {})
        mode_state["bracket_ranking"] = ranking
        mode_state["bracket_summary"] = summary
        mode_state["winner"] = winner_id

        return {
            "mode_state": mode_state,
            "judge_history": [
                {
                    "step": state.get("current_step_idx", 0),
                    "winner": winner_id,
                    "reason": summary,
                    "scores": {
                        entry.get("agent_id", ""): entry.get("score", 0)
                        for entry in ranking
                    },
                }
            ],
            "status": "done",
        }

    return judge
