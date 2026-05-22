"""Budget enforcement tests.

All tests use `single` mode because budget gates are agent-runner-level
(common to every mode).
"""

from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor
from coterie.graph import build_graph


def _cfg(budget: dict | None = None) -> dict:
    cfg = {
        "version": 1,
        "mode": "single",
        "agents": [{"id": "a", "adapter": "fake"}],
        "router": {"enabled": False},
    }
    if budget is not None:
        cfg["budget"] = budget
    return cfg


def test_no_budget_means_no_gating(initial_state):
    """Without a budget block, runs complete normally."""
    FakeAdapter.script("a", [AdapterResult("ok", "", 0, cost_estimate_usd=10.0)])
    cfg = _cfg()
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())
    final = graph.invoke(initial_state("x", cfg))
    assert final["status"] == "done"
    assert final["spend_usd"] == 10.0


def test_halt_on_exceed(initial_state):
    """When spend_usd >= max and policy=halt, subsequent runs are skipped with status=failed."""
    # Two-step plan would let us see the gate fire on step 2. But our planner is
    # trivial (single step). Workaround: initial state already has spend_usd at the cap.
    FakeAdapter.script("a", [AdapterResult("won't run", "", 0)])
    cfg = _cfg({"max_usd_per_task": 1.0, "on_exceed": "halt"})
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())

    state = initial_state("x", cfg)
    state["spend_usd"] = 1.5  # already over the cap
    final = graph.invoke(state)

    assert final["status"] == "failed"
    assert (final.get("mode_state") or {}).get("budget_blocked") is True
    # The adapter was NOT invoked
    assert FakeAdapter.invocations_for("a") == []


def test_checkpoint_on_exceed(initial_state):
    """Policy=checkpoint sets status=awaiting_human."""
    FakeAdapter.script("a", [AdapterResult("won't run", "", 0)])
    cfg = _cfg({"max_usd_per_task": 1.0, "on_exceed": "checkpoint"})
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())

    state = initial_state("x", cfg)
    state["spend_usd"] = 1.5
    final = graph.invoke(state)

    assert final["status"] == "awaiting_human"
    assert (final.get("mode_state") or {}).get("budget_blocked") is True


def test_warn_on_exceed_continues(initial_state):
    """Policy=warn logs but continues to execute the agent."""
    FakeAdapter.script("a", [AdapterResult("did run", "", 0, cost_estimate_usd=0.5)])
    cfg = _cfg({"max_usd_per_task": 1.0, "on_exceed": "warn"})
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())

    state = initial_state("x", cfg)
    state["spend_usd"] = 1.5
    final = graph.invoke(state)

    # warn policy lets the call complete
    assert final["status"] == "done"
    assert final["runs"][-1]["stdout"] == "did run"


def test_warn_at_usd_flags_state(initial_state):
    """warn_at_usd sets mode_state.budget_warned without halting."""
    FakeAdapter.script("a", [AdapterResult("ok", "", 0, cost_estimate_usd=0.1)])
    cfg = _cfg({"warn_at_usd": 0.5})  # no max, just warn
    graph = build_graph(config=cfg, workdir=".", executor=LocalSubprocessExecutor())

    state = initial_state("x", cfg)
    state["spend_usd"] = 0.8  # already past warn threshold
    final = graph.invoke(state)

    assert final["status"] == "done"  # warn doesn't block
    assert (final.get("mode_state") or {}).get("budget_warned") is True
