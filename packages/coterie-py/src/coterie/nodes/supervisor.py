"""Supervisor / router node for `single` mode.

The supervisor picks one agent per subtask. Two strategies:
- `llm` (default) — a cheap LLM looks at the subtask + agent strengths and picks.
- `round-robin` — deterministic; no LLM call.

The decision is recorded in `state.route_history` and the chosen agent_id is set
in `state.next_agent` so the conditional edge can dispatch to the agent runner.
"""

import json
from typing import Any

from coterie.core.llm.base import LLMClient
from coterie.core.state import CoterieState

SUPERVISOR_SYSTEM = """You route coding subtasks to specialist CLI agents.
Pick the best agent for the given subtask based on each agent's stated strengths.
Be decisive. Return strict JSON only — no prose, no markdown.

Output schema: {"agent_id": "<one of the provided agent ids>", "reason": "<one sentence>"}"""


def _format_agents(agents: list[dict]) -> str:
    return "\n".join(
        f"- {a['id']} (adapter={a['adapter']}, strengths={a.get('strengths', [])})"
        for a in agents
    )


def make_supervisor_node(llm: LLMClient | None = None):
    """Build the supervisor node. `llm` is required when strategy='llm' (default)."""

    def supervisor(state: CoterieState) -> dict[str, Any]:
        # Preserve terminal statuses.
        if state.get("status") in ("failed", "awaiting_human"):
            return {}

        plan = state.get("plan") or []
        idx = state.get("current_step_idx", 0)
        if idx >= len(plan):
            return {"status": "done", "next_agent": None}

        cfg = state["config"]
        agents = cfg["agents"]
        subtask = plan[idx]
        router_cfg = cfg.get("router") or {}
        strategy = router_cfg.get("strategy", "llm")
        enabled = router_cfg.get("enabled", True)

        if not enabled or strategy == "round-robin":
            chosen = agents[idx % len(agents)]
            return {
                "next_agent": chosen["id"],
                "route_history": [
                    {
                        "step": idx,
                        "agent_id": chosen["id"],
                        "reason": "round-robin / disabled-router",
                        "strategy": "round-robin" if enabled else "disabled",
                    }
                ],
                "status": "executing",
            }

        if llm is None:
            raise ValueError("supervisor with strategy='llm' requires an LLMClient")

        prompt = f"Task: {state['task']}\nSubtask: {subtask}\n\nAvailable agents:\n{_format_agents(agents)}"
        raw = llm.chat(SUPERVISOR_SYSTEM, [{"role": "user", "content": prompt}])

        try:
            decision = json.loads(raw)
            agent_id = decision["agent_id"]
            reason = decision.get("reason", "")
        except (json.JSONDecodeError, KeyError, TypeError):
            agent_id = agents[0]["id"]
            reason = f"router output unparseable: {raw[:120]!r}"

        if agent_id not in {a["id"] for a in agents}:
            agent_id = agents[0]["id"]
            reason = f"router picked unknown agent; fell back to {agent_id}"

        return {
            "next_agent": agent_id,
            "route_history": [
                {"step": idx, "agent_id": agent_id, "reason": reason, "strategy": "llm"}
            ],
            "status": "executing",
        }

    return supervisor


def make_step_advance_node():
    """A trivial node that increments `current_step_idx` after a single agent runs.

    Lives here instead of in `single.py` so the graph wiring stays tight.
    Preserves terminal statuses (failed, awaiting_human) instead of overwriting.
    """

    def advance(state: CoterieState) -> dict[str, Any]:
        if state.get("status") in ("failed", "awaiting_human"):
            return {}
        return {"current_step_idx": state.get("current_step_idx", 0) + 1, "status": "routing"}

    return advance
