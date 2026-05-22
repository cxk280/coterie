"""`debate` mode — Pro + Con + Moderator across N rounds, then Judge.

    START -> planner -> pro -> con -> moderator --[loop]-> pro
                                          |
                                          +--[done]-> judge -> END
"""

from langgraph.graph import END, START, StateGraph

from coterie.core.compile import compile_with_interrupts
from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import register_mode
from coterie.core.state import CoterieState
from coterie.nodes.agent_runner import make_agent_runner
from coterie.nodes.moderator import make_debate_judge_node, make_moderator_node
from coterie.nodes.planner import make_planner_node

PRO_PROMPT_TEMPLATE = """You are arguing the PRO position in a structured debate.

# Question
{question}

# Round
{round_idx} of {total_rounds}

# Previous round summaries
{prior_summaries}

Make your strongest argument FOR. Cite concrete evidence and address the strongest
counterargument from the prior round (if any). Be concise: 4-8 sentences."""

CON_PROMPT_TEMPLATE = """You are arguing the CON position in a structured debate.

# Question
{question}

# Round
{round_idx} of {total_rounds}

# Previous round summaries
{prior_summaries}

# Pro's argument this round
{pro_argument}

Make your strongest argument AGAINST. Cite concrete evidence and rebut Pro's argument
this round and previous rounds. Be concise: 4-8 sentences."""


def _prior_summaries(state: CoterieState) -> str:
    summaries = (state.get("mode_state") or {}).get("round_summaries", [])
    if not summaries:
        return "(none — this is round 1)"
    return "\n".join(
        f"Round {i + 1}: {s.get('round_summary', '')}" for i, s in enumerate(summaries)
    )


def _pro_prompt(state: CoterieState) -> str:
    cfg = state["config"]
    total = cfg["debate"].get("rounds", 3)
    round_idx = (state.get("mode_state") or {}).get("rounds_completed", 0)
    return PRO_PROMPT_TEMPLATE.format(
        question=state["task"],
        round_idx=round_idx + 1,
        total_rounds=total,
        prior_summaries=_prior_summaries(state),
    )


def _con_prompt(state: CoterieState) -> str:
    cfg = state["config"]
    total = cfg["debate"].get("rounds", 3)
    round_idx = (state.get("mode_state") or {}).get("rounds_completed", 0)
    runs = state.get("runs") or []
    last_pro = next((r for r in reversed(runs) if r.get("role") == "pro"), None)
    pro_argument = last_pro["stdout"][:1500] if last_pro else "(missing)"
    return CON_PROMPT_TEMPLATE.format(
        question=state["task"],
        round_idx=round_idx + 1,
        total_rounds=total,
        prior_summaries=_prior_summaries(state),
        pro_argument=pro_argument,
    )


@register_mode("debate")
def build(
    *,
    workdir: str,
    executor: AdapterExecutor,
    config: dict,
    moderator_llm: LLMClient | None = None,
    judge_llm: LLMClient | None = None,
    checkpointer=None,
    **_,
):
    deb = config.get("debate") or {}
    sides = deb["sides"]
    pro_id, con_id = sides[0], sides[1]

    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", make_planner_node())
    g.add_node(
        "pro",
        make_agent_runner(
            role="pro",
            workdir=workdir,
            executor=executor,
            agent_id=pro_id,
            prompt_fn=_pro_prompt,
        ),
    )
    g.add_node(
        "con",
        make_agent_runner(
            role="con",
            workdir=workdir,
            executor=executor,
            agent_id=con_id,
            prompt_fn=_con_prompt,
        ),
    )
    g.add_node("moderator", make_moderator_node(moderator_llm))
    g.add_node("judge", make_debate_judge_node(judge_llm))

    g.add_edge(START, "planner")
    g.add_edge("planner", "pro")
    g.add_edge("pro", "con")
    g.add_edge("con", "moderator")

    def loop_or_judge(state: CoterieState):
        mode_state = state.get("mode_state") or {}
        rounds_done = mode_state.get("rounds_completed", 0)
        total = state["config"]["debate"].get("rounds", 3)
        return "pro" if rounds_done < total else "judge"

    g.add_conditional_edges("moderator", loop_or_judge, {"pro": "pro", "judge": "judge"})
    g.add_edge("judge", END)

    return compile_with_interrupts(g, config, checkpointer=checkpointer)
