"""Minimal LangGraph wiring. v0.0.1 is a 2-node graph: planner -> agent -> END.

The full supervisor/fan-out/judge graph lives in design.md and lands in v0.1.
"""

from typing import Any

from langgraph.graph import END, StateGraph

from coterie.adapters import REGISTRY
from coterie.adapters.base import AdapterResult
from coterie.state import CoterieState


def make_planner_node():
    def planner(state: CoterieState) -> dict[str, Any]:
        # v0.0.1: trivial planner — the task is the only step.
        return {
            "plan": [state["task"]],
            "current_step_idx": 0,
            "status": "executing",
        }

    return planner


def make_agent_node(agent_id: str, adapter_kind: str, workdir: str):
    adapter_cls = REGISTRY[adapter_kind]
    adapter = adapter_cls(agent_id=agent_id)

    def agent_node(state: CoterieState) -> dict[str, Any]:
        step = state["plan"][state["current_step_idx"]]
        result: AdapterResult = adapter.run(step, workdir)
        run = {
            "agent_id": agent_id,
            "prompt": step,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "exit_code": result.exit_code,
            "files_changed": result.files_changed,
            "duration_s": result.duration_s,
            "cost_estimate_usd": result.cost_estimate_usd,
        }
        spend = state.get("spend_usd", 0.0) + (result.cost_estimate_usd or 0.0)
        return {
            "runs": [run],
            "spend_usd": spend,
            "status": "done" if result.exit_code == 0 else "failed",
        }

    return agent_node


def build_graph(*, agent_id: str, adapter_kind: str, workdir: str = "."):
    """Build the v0.0.1 minimal graph."""
    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", make_planner_node())
    g.add_node("agent", make_agent_node(agent_id, adapter_kind, workdir))
    g.set_entry_point("planner")
    g.add_edge("planner", "agent")
    g.add_edge("agent", END)
    return g.compile()
