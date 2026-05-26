"""End-to-end test for `single` mode."""

import json

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.core.llm.scripted import ScriptedLLMClient
from coterie.graph import build_graph


def test_single_mode_round_robin_no_llm(initial_state):
    """Without router LLM, round-robin selects first agent."""
    FakeAdapter.script("a", [AdapterResult("output", "", 0, cost_estimate_usd=0.01)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    final = graph.invoke(initial_state("hello", cfg))

    assert final["status"] == "done"
    assert len(final["runs"]) == 1
    assert final["runs"][0]["stdout"] == "output"
    assert final["runs"][0]["agent_id"] == "a"
    assert final["spend_usd"] == 0.01
    assert final["route_history"][0]["strategy"] == "disabled"


def test_single_mode_llm_router_picks_named_agent(initial_state):
    """LLM router returns a JSON decision; the named agent runs."""
    FakeAdapter.script("b", [AdapterResult("b-out", "", 0)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [
            {"id": "a", "adapter": "fake", "strengths": ["docs"]},
            {"id": "b", "adapter": "fake", "strengths": ["code"]},
        ],
    }
    router_llm = ScriptedLLMClient([json.dumps({"agent_id": "b", "reason": "this is code"})])
    graph = build_graph(
        config=cfg, workdir=".", executor=LocalSubprocessExecutor(), supervisor_llm=router_llm
    )
    final = graph.invoke(initial_state("write code", cfg))

    assert final["status"] == "done"
    assert final["runs"][0]["agent_id"] == "b"
    assert final["route_history"][0]["agent_id"] == "b"
    assert "this is code" in final["route_history"][0]["reason"]


def test_single_mode_llm_router_garbage_falls_back(initial_state):
    """When the router returns unparseable JSON, fall back to first agent."""
    FakeAdapter.script("a", [AdapterResult("a-out", "", 0)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [
            {"id": "a", "adapter": "fake"},
            {"id": "b", "adapter": "fake"},
        ],
    }
    router_llm = ScriptedLLMClient(["not json at all"])
    graph = build_graph(
        config=cfg, workdir=".", executor=LocalSubprocessExecutor(), supervisor_llm=router_llm
    )
    final = graph.invoke(initial_state("x", cfg))

    assert final["runs"][0]["agent_id"] == "a"
    assert "unparseable" in final["route_history"][0]["reason"]
