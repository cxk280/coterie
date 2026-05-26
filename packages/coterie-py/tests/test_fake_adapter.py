import pytest
from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter, FakeAdapterError


def test_script_and_replay():
    FakeAdapter.script("a", [AdapterResult("hello", "", 0, cost_estimate_usd=0.001)])
    adapter = FakeAdapter(agent_id="a")
    result = adapter.run("prompt", ".")
    assert result.stdout == "hello"
    assert result.exit_code == 0
    assert result.cost_estimate_usd == 0.001


def test_independent_queues_per_agent_id():
    FakeAdapter.script("a", [AdapterResult("from-a", "", 0)])
    FakeAdapter.script("b", [AdapterResult("from-b", "", 0)])
    assert FakeAdapter(agent_id="a").run("x", ".").stdout == "from-a"
    assert FakeAdapter(agent_id="b").run("x", ".").stdout == "from-b"


def test_exhaustion_raises():
    FakeAdapter.script("a", [AdapterResult("once", "", 0)])
    adapter = FakeAdapter(agent_id="a")
    adapter.run("x", ".")
    with pytest.raises(FakeAdapterError, match="no scripted results"):
        adapter.run("x", ".")


def test_invocations_recorded():
    FakeAdapter.script("a", [AdapterResult("o", "", 0)])
    FakeAdapter(agent_id="a").run("the-prompt", "/tmp")
    assert FakeAdapter.invocations_for("a") == [{"prompt": "the-prompt", "workdir": "/tmp"}]
