"""LLM planner tests."""

import json

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.core.llm.scripted import ScriptedLLMClient
from coterie.graph import build_graph
from coterie.nodes.planner import make_llm_planner_node


def test_llm_planner_returns_subtasks(initial_state):
    planner_response = json.dumps({"subtasks": ["step 1", "step 2", "step 3"]})
    planner = make_llm_planner_node(ScriptedLLMClient([planner_response]))
    cfg = {"version": 1, "mode": "single", "agents": [{"id": "a", "adapter": "fake"}]}
    state = initial_state("complex task", cfg)
    result = planner(state)
    assert result["plan"] == ["step 1", "step 2", "step 3"]
    assert result["current_step_idx"] == 0
    assert result["status"] == "executing"


def test_llm_planner_fallback_on_garbage(initial_state):
    """Garbage output → fall back to trivial single-step plan."""
    planner = make_llm_planner_node(ScriptedLLMClient(["not json"]))
    cfg = {"version": 1, "mode": "single", "agents": [{"id": "a", "adapter": "fake"}]}
    state = initial_state("simple task", cfg)
    result = planner(state)
    assert result["plan"] == ["simple task"]


def test_llm_planner_caps_max_subtasks(initial_state):
    """Subtasks list is truncated to max_subtasks."""
    planner_response = json.dumps({"subtasks": ["a", "b", "c", "d", "e", "f", "g"]})
    planner = make_llm_planner_node(ScriptedLLMClient([planner_response]), max_subtasks=3)
    cfg = {"version": 1, "mode": "single", "agents": [{"id": "a", "adapter": "fake"}]}
    result = planner(initial_state("x", cfg))
    assert result["plan"] == ["a", "b", "c"]


def test_single_mode_iterates_multi_step_plan(initial_state):
    """End-to-end: planner produces 3 subtasks; single mode runs the agent 3 times."""
    planner_response = json.dumps({"subtasks": ["step1", "step2", "step3"]})
    FakeAdapter.script("a", [
        AdapterResult("did 1", "", 0, cost_estimate_usd=0.01),
        AdapterResult("did 2", "", 0, cost_estimate_usd=0.01),
        AdapterResult("did 3", "", 0, cost_estimate_usd=0.01),
    ])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
        "planner": {"enabled": True},
    }
    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        planner_llm=ScriptedLLMClient([planner_response]),
    )
    final = graph.invoke(initial_state("do everything", cfg))

    assert final["status"] == "done"
    assert len(final["runs"]) == 3
    assert final["spend_usd"] == 0.03

    invocations = FakeAdapter.invocations_for("a")
    assert [i["prompt"] for i in invocations] == ["step1", "step2", "step3"]


def test_planner_disabled_uses_trivial(initial_state):
    """Without planner.enabled, the trivial planner runs even if planner_llm is provided."""
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    graph = build_graph(
        config=cfg,
        workdir=".",
        executor=LocalSubprocessExecutor(),
        # planner_llm provided but planner.enabled is False
        planner_llm=ScriptedLLMClient([json.dumps({"subtasks": ["x", "y"]})]),
    )
    final = graph.invoke(initial_state("the task", cfg))
    assert len(final["runs"]) == 1  # single step (trivial)
    assert final["runs"][0]["prompt"] == "the task"
