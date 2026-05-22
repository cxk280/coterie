"""Trivial planner node.

v0.1: `plan == [task]`. A real LLM-driven planner that decomposes work into
subtasks is v0.2 — it'd live here as `make_llm_planner_node(llm)`.
"""

from typing import Any

from coterie.core.state import CoterieState


def make_planner_node():
    def planner(state: CoterieState) -> dict[str, Any]:
        return {
            "plan": [state["task"]],
            "current_step_idx": 0,
            "status": "executing",
            "mode_state": state.get("mode_state") or {},
        }

    return planner
