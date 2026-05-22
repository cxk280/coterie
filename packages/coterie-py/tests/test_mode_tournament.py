"""End-to-end test for `tournament` mode."""

import json

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.core.llm.scripted import ScriptedLLMClient
from coterie.graph import build_graph



def test_three_way_tournament(initial_state):
    FakeAdapter.script("a", [AdapterResult("solution A", "", 0, cost_estimate_usd=0.05)])
    FakeAdapter.script("b", [AdapterResult("solution B", "", 0, cost_estimate_usd=0.10)])
    FakeAdapter.script("c", [AdapterResult("solution C", "", 0, cost_estimate_usd=0.02)])

    cfg = {
        "version": 1,
        "mode": "tournament",
        "agents": [
            {"id": "a", "adapter": "fake"},
            {"id": "b", "adapter": "fake"},
            {"id": "c", "adapter": "fake"},
        ],
        "tournament": {"participants": ["a", "b", "c"]},
    }
    judge_response = json.dumps({
        "ranking": [
            {"agent_id": "b", "score": 90, "reason": "best impl"},
            {"agent_id": "a", "score": 80, "reason": "OK"},
            {"agent_id": "c", "score": 60, "reason": "weakest"},
        ],
        "winner": "b",
        "summary": "B wins with strongest implementation.",
    })

    graph = build_graph(
        config=cfg, workdir=".", executor=LocalSubprocessExecutor(), judge_llm=ScriptedLLMClient([judge_response])
    )
    final = graph.invoke(initial_state("solve", cfg))

    assert final["status"] == "done"
    assert final["judge_history"][-1]["winner"] == "b"
    assert final["mode_state"]["winner"] == "b"
    assert len(final["mode_state"]["bracket_ranking"]) == 3


def test_tournament_falls_back_when_judge_misbehaves(initial_state):
    """Garbage judge output → fall back to cheapest successful attempt."""
    FakeAdapter.script("expensive", [AdapterResult("ok", "", 0, cost_estimate_usd=1.00)])
    FakeAdapter.script("cheap", [AdapterResult("ok", "", 0, cost_estimate_usd=0.01)])
    cfg = {
        "version": 1,
        "mode": "tournament",
        "agents": [
            {"id": "expensive", "adapter": "fake"},
            {"id": "cheap", "adapter": "fake"},
        ],
        "tournament": {"participants": ["expensive", "cheap"]},
    }
    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        judge_llm=ScriptedLLMClient(["not parseable json"]),
    )
    final = graph.invoke(initial_state("solve", cfg))
    assert final["judge_history"][-1]["winner"] == "cheap"
