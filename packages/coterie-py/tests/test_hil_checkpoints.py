"""HIL checkpoint tests.

Tests don't drive the CLI's interactive prompt — they verify the graph compile
correctly attaches interrupts + checkpointer, that invoke() pauses at the
configured node, and that invoke(None, config=...) resumes.
"""

import uuid

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.graph import build_graph


def _thread_config():
    return {"configurable": {"thread_id": str(uuid.uuid4())}}


def test_checkpoint_pauses_before_agent(initial_state):
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
        "checkpoints": {"agent": True},
    }
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    thread = _thread_config()

    state = initial_state("x", cfg)
    graph.invoke(state, config=thread)

    # The agent didn't run yet.
    assert FakeAdapter.invocations_for("a") == []
    # The graph reports `agent` as the next node.
    state_info = graph.get_state(thread)
    assert list(state_info.next) == ["agent"]


def test_checkpoint_resumes_when_invoked_with_none(initial_state):
    FakeAdapter.script("a", [AdapterResult("ran", "", 0, cost_estimate_usd=0.01)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
        "checkpoints": {"agent": True},
    }
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    thread = _thread_config()

    graph.invoke(initial_state("x", cfg), config=thread)
    final = graph.invoke(None, config=thread)

    # Now the agent has run.
    assert len(FakeAdapter.invocations_for("a")) == 1
    assert final["runs"][-1]["stdout"] == "ran"
    assert final["status"] == "done"


def test_no_checkpoints_means_no_interrupts(initial_state):
    """Without any `true` checkpoints, graph runs to completion in one invoke()."""
    FakeAdapter.script("a", [AdapterResult("ran", "", 0)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
        # No `checkpoints` key at all.
    }
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    final = graph.invoke(initial_state("x", cfg))
    assert final["status"] == "done"
    assert len(FakeAdapter.invocations_for("a")) == 1


def test_false_checkpoints_disabled(initial_state):
    """`checkpoints: { agent: false }` means no interrupt."""
    FakeAdapter.script("a", [AdapterResult("ran", "", 0)])
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
        "checkpoints": {"agent": False},
    }
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    final = graph.invoke(initial_state("x", cfg))
    assert final["status"] == "done"


def test_checkpoint_in_adversarial_mode_before_judge(initial_state):
    """HIL gate before the adversarial judge."""
    FakeAdapter.script("impl", [AdapterResult("impl out", "", 0)])
    FakeAdapter.script("aud", [AdapterResult("[]", "", 0)])  # no findings → judge accepts
    cfg = {
        "version": 1,
        "mode": "adversarial",
        "agents": [
            {"id": "impl", "adapter": "fake"},
            {"id": "aud", "adapter": "fake"},
        ],
        "adversarial": {"implementer": "impl", "auditor": "aud", "max_rounds": 1},
        "checkpoints": {"judge": True},
    }
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    thread = _thread_config()

    graph.invoke(initial_state("write foo", cfg), config=thread)
    # Paused before the judge — implementer and auditor have already run.
    assert len(FakeAdapter.invocations_for("impl")) == 1
    assert len(FakeAdapter.invocations_for("aud")) == 1
    state_info = graph.get_state(thread)
    assert list(state_info.next) == ["judge"]

    # Resume.
    final = graph.invoke(None, config=thread)
    assert final["status"] == "done"
