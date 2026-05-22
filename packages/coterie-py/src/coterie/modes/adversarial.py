"""`adversarial` mode — Implementer / Auditor / Judge with refinement loop.

    START -> planner -> implementer -> record_impl
                          ^                |
                          |                v
                          |              auditor
                          |                |
                          |                v
                          |             record_findings
                          |                |
                          |                v
                          +--[revise]----- judge ----[accept]-> END

The Auditor is the Coterie-distinctive primitive: a CLI adapter invocation with
a structured-findings prompt. The Judge then sustains or rejects findings based
on the configured severity threshold; sustained findings + remaining rounds
loop back to the Implementer, which sees them in its next prompt.
"""

from langgraph.graph import END, START, StateGraph

from coterie.core.compile import compile_with_interrupts
from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import register_mode
from coterie.core.state import CoterieState
from coterie.nodes.agent_runner import make_agent_runner
from coterie.nodes.auditor import (
    adversarial_auditor_prompt,
    adversarial_implementer_prompt,
    make_adversarial_judge_node,
    make_record_auditor_findings_node,
    make_record_implementer_output_node,
)
from coterie.nodes.planner import make_planner_node


@register_mode("adversarial")
def build(
    *,
    workdir: str,
    executor: AdapterExecutor,
    config: dict,
    judge_llm: LLMClient | None = None,
    **_,
):
    adv = config.get("adversarial") or {}
    implementer_id = adv["implementer"]
    auditor_id = adv["auditor"]

    g: StateGraph = StateGraph(CoterieState)
    g.add_node("planner", make_planner_node())
    g.add_node(
        "implementer",
        make_agent_runner(
            role="implementer",
            workdir=workdir,
            executor=executor,
            agent_id=implementer_id,
            prompt_fn=adversarial_implementer_prompt,
        ),
    )
    g.add_node("record_impl", make_record_implementer_output_node())
    g.add_node(
        "auditor",
        make_agent_runner(
            role="auditor",
            workdir=workdir,
            executor=executor,
            agent_id=auditor_id,
            prompt_fn=adversarial_auditor_prompt,
        ),
    )
    g.add_node("record_findings", make_record_auditor_findings_node())
    g.add_node("judge", make_adversarial_judge_node(judge_llm))

    g.add_edge(START, "planner")
    g.add_edge("planner", "implementer")
    g.add_edge("implementer", "record_impl")
    g.add_edge("record_impl", "auditor")
    g.add_edge("auditor", "record_findings")
    g.add_edge("record_findings", "judge")

    def route_from_judge(state: CoterieState):
        return END if state.get("status") == "done" else "implementer"

    g.add_conditional_edges(
        "judge", route_from_judge, {END: END, "implementer": "implementer"}
    )

    return compile_with_interrupts(g, config)
