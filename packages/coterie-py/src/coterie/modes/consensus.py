"""`consensus` mode — N agents independently report findings; engine scores agreement.

    START -> planner -> [participant_1 || ... || participant_N] -> engine -> END
"""

from langgraph.graph import END, START, StateGraph

from coterie.core.compile import compile_with_interrupts
from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import register_mode
from coterie.core.state import CoterieState
from coterie.nodes.agent_runner import make_agent_runner
from coterie.nodes.consensus_engine import make_consensus_engine_node
from coterie.nodes.planner import make_planner_node

PARTICIPANT_PROMPT_TEMPLATE = """Review the following work item and report every defect you can find.

# Task
{task}

Report defects only — do NOT propose fixes. Return ONLY a JSON array. No prose, no markdown.
Each finding:
{{
  "category": "bug|perf|security|clarity|missed-requirement|edge-case",
  "severity": "low|medium|high|critical",
  "description": "<one sentence>",
  "line_ranges": ["path:start-end", ...]
}}

If you find no defects, return []."""


def _participant_prompt(state: CoterieState) -> str:
    return PARTICIPANT_PROMPT_TEMPLATE.format(task=state["task"])


@register_mode("consensus")
def build(
    *,
    workdir: str,
    executor: AdapterExecutor,
    config: dict,
    consensus_llm: LLMClient | None = None,
    **_,
):
    cons_cfg = config.get("consensus") or {}
    participants = cons_cfg.get("participants") or [a["id"] for a in config.get("agents", [])]

    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", make_planner_node())
    for pid in participants:
        g.add_node(
            f"participant_{pid}",
            make_agent_runner(
                role="consensus-participant",
                workdir=workdir,
                executor=executor,
                agent_id=pid,
                prompt_fn=_participant_prompt,
            ),
        )
    g.add_node("engine", make_consensus_engine_node(consensus_llm))

    g.add_edge(START, "planner")
    for pid in participants:
        g.add_edge("planner", f"participant_{pid}")
        g.add_edge(f"participant_{pid}", "engine")
    g.add_edge("engine", END)

    return compile_with_interrupts(g, config)
