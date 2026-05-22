"""`tournament` mode — N-way bracket.

    START -> planner -> [participant_1 || ... || participant_N] -> bracket_judge -> END

v0.1: single round, N-way pairwise judging. Multi-round elimination brackets
(power-of-two participants, recursive halving) is v0.1.x. The architecture
already supports it — `bracket_judge` would return a `next_round` field instead
of `winner` and a loop edge would re-enter `bracket_judge` until one remains.
"""

from langgraph.graph import END, START, StateGraph

from coterie.core.compile import compile_with_interrupts
from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import register_mode
from coterie.core.state import CoterieState
from coterie.nodes.agent_runner import make_agent_runner
from coterie.nodes.bracket import make_bracket_judge_node
from coterie.nodes.planner import make_planner_node


@register_mode("tournament")
def build(
    *,
    workdir: str,
    executor: AdapterExecutor,
    config: dict,
    judge_llm: LLMClient | None = None,
    **_,
):
    tournament = config.get("tournament") or {}
    participants = tournament.get("participants") or []

    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", make_planner_node())
    for pid in participants:
        g.add_node(
            f"tparticipant_{pid}",
            make_agent_runner(
                role="tournament-participant",
                workdir=workdir,
                executor=executor,
                agent_id=pid,
            ),
        )
    g.add_node("bracket_judge", make_bracket_judge_node(judge_llm))

    g.add_edge(START, "planner")
    for pid in participants:
        g.add_edge("planner", f"tparticipant_{pid}")
        g.add_edge(f"tparticipant_{pid}", "bracket_judge")
    g.add_edge("bracket_judge", END)

    return compile_with_interrupts(g, config)
