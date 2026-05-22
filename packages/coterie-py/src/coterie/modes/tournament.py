"""`tournament` mode — N-way bracket.

Single-round (`rounds: 1`, default):
    START -> planner -> [participant_1 || ... || participant_N] -> bracket_judge -> END

Multi-round (`rounds: N > 1`):
    START -> planner -> [participant_1 || ... || participant_N] -> bracket_judge
                          ^                                            |
                          +---[loop until 1 survivor or N rounds]-----+
                                                                       |
                                                                       END

Each participant node checks `mode_state.eliminated_participants` and short-
circuits if its agent is already out. Loop edges go to all participant nodes,
but eliminated ones return immediately without spawning the CLI.
"""

from typing import Any

from langgraph.graph import END, START, StateGraph

from coterie.core.compile import compile_with_interrupts
from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import register_mode
from coterie.core.state import CoterieState
from coterie.nodes.agent_runner import make_agent_runner
from coterie.nodes.bracket import make_bracket_judge_node
from coterie.nodes.planner import make_planner_node


def _make_eliminated_aware_participant(agent_id: str, workdir: str, executor: AdapterExecutor):
    """Wraps `make_agent_runner` with an eliminated-check that short-circuits."""
    inner = make_agent_runner(
        role="tournament-participant",
        workdir=workdir,
        executor=executor,
        agent_id=agent_id,
    )

    def node(state: CoterieState) -> dict[str, Any]:
        eliminated = (state.get("mode_state") or {}).get("eliminated_participants") or []
        if agent_id in eliminated:
            return {}
        return inner(state)

    return node


@register_mode("tournament")
def build(
    *,
    workdir: str,
    executor: AdapterExecutor,
    config: dict,
    judge_llm: LLMClient | None = None,
    checkpointer=None,
    **_,
):
    tournament = config.get("tournament") or {}
    participants = tournament.get("participants") or []
    multi_round = tournament.get("rounds", 1) > 1

    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", make_planner_node())
    for pid in participants:
        g.add_node(f"tparticipant_{pid}", _make_eliminated_aware_participant(pid, workdir, executor))
    g.add_node("bracket_judge", make_bracket_judge_node(judge_llm))

    g.add_edge(START, "planner")
    for pid in participants:
        g.add_edge("planner", f"tparticipant_{pid}")
        g.add_edge(f"tparticipant_{pid}", "bracket_judge")

    if multi_round:
        def route(state: CoterieState):
            if state.get("status") == "done":
                return END
            return [f"tparticipant_{pid}" for pid in participants]

        g.add_conditional_edges(
            "bracket_judge",
            route,
            {END: END, **{f"tparticipant_{pid}": f"tparticipant_{pid}" for pid in participants}},
        )
    else:
        g.add_edge("bracket_judge", END)

    return compile_with_interrupts(g, config, checkpointer=checkpointer)
