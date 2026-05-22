from coterie.adapters.base import AdapterResult
from coterie.adapters.fake import FakeAdapter
from coterie.core.executor import LocalSubprocessExecutor


def test_local_executor_delegates_to_adapter():
    FakeAdapter.script("a", [AdapterResult("delegated", "", 0)])
    executor = LocalSubprocessExecutor()
    result = executor.execute(FakeAdapter(agent_id="a"), "prompt", ".")
    assert result.stdout == "delegated"


def test_local_executor_threads_timeout():
    """Smoke test: timeout_s kwarg passes through. (No real timeout fires.)"""
    FakeAdapter.script("a", [AdapterResult("ok", "", 0)])
    executor = LocalSubprocessExecutor()
    result = executor.execute(FakeAdapter(agent_id="a"), "p", ".", timeout_s=30)
    assert result.stdout == "ok"
