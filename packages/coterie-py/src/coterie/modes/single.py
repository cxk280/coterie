"""`single` mode — supervisor routes one agent per subtask.

    START -> planner -> supervisor --[END if done]-> END
                            |
                            +--[next_agent]-> agent -> supervisor (loop)
"""

from langgraph.graph import END, START, StateGraph

from coterie.core.compile import compile_with_interrupts
from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import register_mode
from coterie.core.state import CoterieState
from coterie.nodes.agent_runner import make_agent_runner
from coterie.nodes.planner import make_llm_planner_node, make_planner_node
from coterie.nodes.supervisor import make_step_advance_node, make_supervisor_node


def _planner_node(config: dict, planner_llm: LLMClient | None):
    planner_cfg = config.get("planner") or {}
    if planner_cfg.get("enabled") and planner_llm is not None:
        return make_llm_planner_node(
            planner_llm, max_subtasks=planner_cfg.get("max_subtasks", 5)
        )
    return make_planner_node()


@register_mode("single")
def build(
    *,
    workdir: str,
    executor: AdapterExecutor,
    config: dict,
    supervisor_llm: LLMClient | None = None,
    planner_llm: LLMClient | None = None,
    checkpointer=None,
    **_,
):
    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", _planner_node(config, planner_llm))
    g.add_node("supervisor", make_supervisor_node(supervisor_llm))
    g.add_node(
        "agent",
        make_agent_runner(
            role="agent",
            workdir=workdir,
            executor=executor,
            agent_id_fn=lambda state: state["next_agent"],
        ),
    )
    g.add_node("advance", make_step_advance_node())

    g.add_edge(START, "planner")
    g.add_edge("planner", "supervisor")

    def route(state: CoterieState):
        # Terminal statuses (budget halt, HIL block) end the graph immediately.
        if state.get("status") in ("done", "failed", "awaiting_human"):
            return END
        idx = state.get("current_step_idx", 0)
        plan = state.get("plan") or []
        if idx >= len(plan):
            return END
        return "agent"

    g.add_conditional_edges("supervisor", route, {END: END, "agent": "agent"})
    g.add_edge("agent", "advance")
    g.add_edge("advance", "supervisor")
    return compile_with_interrupts(g, config, checkpointer=checkpointer)
