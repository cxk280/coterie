"""Planner nodes.

Two factories:
- `make_planner_node()` — trivial: `plan == [task]`. The default for every mode.
- `make_llm_planner_node(llm, max_subtasks)` — decomposes the task into an
  ordered list of subtasks via an LLM call. Enabled by `planner.enabled: true`
  in config; only `single` mode currently iterates the multi-step plan, but the
  factory is available to any mode that wants it.
"""

import json
from typing import Any

from coterie.core.llm.base import LLMClient
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


PLANNER_SYSTEM = """You decompose a coding task into a sequence of focused subtasks.
Keep subtasks atomic, in execution order, and roughly 1-2 sentences each.
Aim for 1-5 subtasks total — return exactly one when the task is already atomic.

Return strict JSON only — no prose, no markdown:
{"subtasks": ["<subtask 1>", "<subtask 2>", ...]}"""


def make_llm_planner_node(llm: LLMClient, *, max_subtasks: int = 5):
    def planner(state: CoterieState) -> dict[str, Any]:
        task = state["task"]
        raw = llm.chat(PLANNER_SYSTEM, [{"role": "user", "content": task}])
        try:
            payload = json.loads(raw)
            subtasks = payload["subtasks"]
            if not isinstance(subtasks, list) or not all(isinstance(s, str) for s in subtasks):
                raise ValueError("subtasks must be a list of strings")
            subtasks = subtasks[:max_subtasks] or [task]
        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            # Fall back to trivial single-step plan.
            subtasks = [task]
        return {
            "plan": subtasks,
            "current_step_idx": 0,
            "status": "executing",
            "mode_state": state.get("mode_state") or {},
        }

    return planner
