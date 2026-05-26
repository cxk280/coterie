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


def test_multi_round_eliminates_losers(initial_state):
    """4 participants, 2 rounds: round 1 keeps top 2, round 2 picks winner."""
    FakeAdapter.script("a", [AdapterResult("a r1", "", 0, cost_estimate_usd=0.01)])
    FakeAdapter.script("b", [
        AdapterResult("b r1", "", 0, cost_estimate_usd=0.02),
        AdapterResult("b r2", "", 0, cost_estimate_usd=0.02),
    ])
    FakeAdapter.script("c", [
        AdapterResult("c r1", "", 0, cost_estimate_usd=0.03),
        AdapterResult("c r2", "", 0, cost_estimate_usd=0.03),
    ])
    FakeAdapter.script("d", [AdapterResult("d r1", "", 0, cost_estimate_usd=0.04)])

    round1 = json.dumps({
        "ranking": [
            {"agent_id": "b", "score": 90, "reason": "best"},
            {"agent_id": "c", "score": 80, "reason": "second"},
            {"agent_id": "a", "score": 50, "reason": "weak"},
            {"agent_id": "d", "score": 40, "reason": "weakest"},
        ],
        "winner": "b",
        "summary": "round 1: b and c advance",
    })
    round2 = json.dumps({
        "ranking": [
            {"agent_id": "b", "score": 95, "reason": "clear winner"},
            {"agent_id": "c", "score": 85, "reason": "runner-up"},
        ],
        "winner": "b",
        "summary": "round 2: b wins",
    })

    cfg = {
        "version": 1,
        "mode": "tournament",
        "agents": [
            {"id": "a", "adapter": "fake"},
            {"id": "b", "adapter": "fake"},
            {"id": "c", "adapter": "fake"},
            {"id": "d", "adapter": "fake"},
        ],
        "tournament": {"participants": ["a", "b", "c", "d"], "rounds": 2},
    }
    graph = build_graph(
        config=cfg, workdir=".", executor=LocalSubprocessExecutor(),
        judge_llm=ScriptedLLMClient([round1, round2]),
    )
    final = graph.invoke(initial_state("solve", cfg))

    assert final["status"] == "done"
    assert final["mode_state"]["winner"] == "b"
    assert final["mode_state"]["tournament_round_idx"] == 2
    assert len(FakeAdapter.invocations_for("a")) == 1
    assert len(FakeAdapter.invocations_for("d")) == 1
    assert len(FakeAdapter.invocations_for("b")) == 2
    assert len(FakeAdapter.invocations_for("c")) == 2


def test_multi_round_terminates_when_one_survivor(initial_state):
    """2 participants with rounds=3 still finishes after round 1 (only 1 can survive)."""
    FakeAdapter.script("a", [AdapterResult("a", "", 0, cost_estimate_usd=0.01)])
    FakeAdapter.script("b", [AdapterResult("b", "", 0, cost_estimate_usd=0.02)])
    judge_resp = json.dumps({
        "ranking": [{"agent_id": "a", "score": 90, "reason": "win"}, {"agent_id": "b", "score": 50, "reason": "loss"}],
        "winner": "a",
        "summary": "a wins",
    })
    cfg = {
        "version": 1,
        "mode": "tournament",
        "agents": [{"id": "a", "adapter": "fake"}, {"id": "b", "adapter": "fake"}],
        "tournament": {"participants": ["a", "b"], "rounds": 3},
    }
    graph = build_graph(
        config=cfg, workdir=".", executor=LocalSubprocessExecutor(),
        judge_llm=ScriptedLLMClient([judge_resp]),
    )
    final = graph.invoke(initial_state("solve", cfg))
    assert final["status"] == "done"
    assert final["mode_state"]["winner"] == "a"
    assert final["mode_state"]["tournament_round_idx"] == 1


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
