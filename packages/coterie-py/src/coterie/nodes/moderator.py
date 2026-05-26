"""Moderator + Judge nodes for `debate` mode.

Moderator: summarizes each round, flags unresolved disagreements.
Judge: picks the winning side after N rounds.
"""

import json
from typing import Any

from coterie.core.llm.base import LLMClient
from coterie.core.state import CoterieState

MODERATOR_SYSTEM = """You are an impartial debate moderator.
Given the latest Pro and Con arguments, produce a concise round summary and identify
the strongest unresolved disagreement. Return strict JSON only:
{
  "round_summary": "<2-3 sentences>",
  "unresolved": "<the strongest open disagreement>",
  "fact_check_needed": ["<claim>", ...]
}
"""

DEBATE_JUDGE_SYSTEM = """You are an impartial debate judge.
You see N rounds of Pro and Con arguments on a single question. Pick the stronger
position based on: evidence quality, logical coherence, addressing the opponent's strongest points,
and practical applicability.

Return strict JSON only:
{
  "winner": "pro" | "con" | "tie",
  "reason": "<3-4 sentences>",
  "scores": {"pro": <int 1-10>, "con": <int 1-10>}
}
"""


def make_moderator_node(llm: LLMClient | None = None):
    def moderator(state: CoterieState) -> dict[str, Any]:
        runs = state.get("runs") or []
        mode_state = dict(state.get("mode_state") or {})

        pro_run = next((r for r in reversed(runs) if r.get("role") == "pro"), None)
        con_run = next((r for r in reversed(runs) if r.get("role") == "con"), None)
        if not pro_run or not con_run:
            return {"mode_state": mode_state}

        if llm is None:
            summary = {
                "round_summary": "no moderator LLM configured",
                "unresolved": "",
                "fact_check_needed": [],
            }
        else:
            prompt = (
                f"Question: {state['task']}\n\n"
                f"Pro argument:\n{pro_run['stdout'][:1500]}\n\n"
                f"Con argument:\n{con_run['stdout'][:1500]}"
            )
            raw = llm.chat(MODERATOR_SYSTEM, [{"role": "user", "content": prompt}])
            try:
                summary = json.loads(raw)
            except json.JSONDecodeError:
                summary = {"round_summary": raw[:300], "unresolved": "", "fact_check_needed": []}

        mode_state["rounds_completed"] = mode_state.get("rounds_completed", 0) + 1
        mode_state["round_summaries"] = (mode_state.get("round_summaries") or []) + [summary]
        return {"mode_state": mode_state}

    return moderator


def make_debate_judge_node(llm: LLMClient | None = None):
    def judge(state: CoterieState) -> dict[str, Any]:
        cfg = state["config"]
        sides = cfg["debate"]["sides"]

        runs = state.get("runs") or []
        pro_runs = [r for r in runs if r.get("role") == "pro"]
        con_runs = [r for r in runs if r.get("role") == "con"]
        transcript = "\n\n".join(
            f"Round {i + 1}\nPRO: {p['stdout'][:800]}\nCON: {c['stdout'][:800]}"
            for i, (p, c) in enumerate(zip(pro_runs, con_runs, strict=False))
        )

        if llm is None:
            decision = {"winner": "tie", "reason": "no judge LLM configured", "scores": {}}
        else:
            raw = llm.chat(
                DEBATE_JUDGE_SYSTEM,
                [{"role": "user", "content": f"Question: {state['task']}\n\n{transcript}"}],
            )
            try:
                decision = json.loads(raw)
            except json.JSONDecodeError:
                decision = {
                    "winner": "tie",
                    "reason": f"judge output unparseable: {raw[:120]!r}",
                    "scores": {},
                }

        winner_label = decision.get("winner", "tie")
        winner_agent = (
            sides[0]
            if winner_label == "pro"
            else sides[1] if winner_label == "con" else "tie"
        )

        mode_state = dict(state.get("mode_state") or {})
        mode_state["debate_verdict"] = decision

        return {
            "mode_state": mode_state,
            "judge_history": [
                {
                    "step": state.get("current_step_idx", 0),
                    "winner": winner_agent,
                    "reason": decision.get("reason", ""),
                    "scores": decision.get("scores", {}),
                }
            ],
            "status": "done",
        }

    return judge
