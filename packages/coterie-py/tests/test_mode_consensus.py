"""End-to-end test for `consensus` mode."""

import json

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.core.llm.scripted import ScriptedLLMClient
from coterie.graph import build_graph


def test_two_agents_agree_one_finding_is_confirmed(initial_state):
    """Two of two agents report the same finding → confirmed."""
    finding_a = [{"category": "bug", "severity": "high", "description": "missing null check", "line_ranges": ["x.py:5-6"]}]
    finding_b = [{"category": "bug", "severity": "high", "description": "null check missing", "line_ranges": ["x.py:5-7"]}]
    FakeAdapter.script("a", [AdapterResult(json.dumps(finding_a), "", 0)])
    FakeAdapter.script("b", [AdapterResult(json.dumps(finding_b), "", 0)])

    cfg = {
        "version": 1,
        "mode": "consensus",
        "agents": [
            {"id": "a", "adapter": "fake"},
            {"id": "b", "adapter": "fake"},
        ],
    }

    # Engine clusters the two findings into one (LLM-driven).
    engine_response = json.dumps([{
        "description": "missing null check",
        "category": "bug",
        "severity": "high",
        "supporting_agents": ["a", "b"],
        "member_indices": [0, 1],
    }])
    engine_llm = ScriptedLLMClient([engine_response])
    graph = build_graph(
        config=cfg, workdir=".", executor=LocalSubprocessExecutor(), consensus_llm=engine_llm
    )
    final = graph.invoke(initial_state("review my code", cfg))

    consensus = final["mode_state"]["consensus_findings"]
    assert len(consensus) == 1
    assert consensus[0]["label"] == "confirmed"
    assert consensus[0]["agreement_count"] == 2
    assert consensus[0]["agreement_ratio"] == 1.0


def test_no_findings_yields_empty_consensus(initial_state):
    """All participants return empty arrays → no consensus findings."""
    FakeAdapter.script("a", [AdapterResult("[]", "", 0)])
    FakeAdapter.script("b", [AdapterResult("[]", "", 0)])
    cfg = {
        "version": 1,
        "mode": "consensus",
        "agents": [{"id": "a", "adapter": "fake"}, {"id": "b", "adapter": "fake"}],
    }
    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        consensus_llm=ScriptedLLMClient([]),
    )
    final = graph.invoke(initial_state("x", cfg))
    assert final["mode_state"]["consensus_findings"] == []


def test_single_agent_finding_labeled_unverified(initial_state):
    """Only one of two agents reports → label is `unverified` (not `confirmed`)."""
    finding = json.dumps([{"category": "bug", "severity": "low", "description": "x", "line_ranges": []}])
    FakeAdapter.script("a", [AdapterResult(finding, "", 0)])
    FakeAdapter.script("b", [AdapterResult("[]", "", 0)])

    engine_response = json.dumps([{
        "description": "x",
        "category": "bug",
        "severity": "low",
        "supporting_agents": ["a"],
        "member_indices": [0],
    }])
    cfg = {
        "version": 1,
        "mode": "consensus",
        "agents": [{"id": "a", "adapter": "fake"}, {"id": "b", "adapter": "fake"}],
    }
    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        consensus_llm=ScriptedLLMClient([engine_response]),
    )
    final = graph.invoke(initial_state("review", cfg))

    consensus = final["mode_state"]["consensus_findings"]
    assert consensus[0]["label"] == "unverified"
    assert consensus[0]["agreement_ratio"] == 0.5
