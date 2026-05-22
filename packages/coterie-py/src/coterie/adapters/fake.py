"""In-process FakeAdapter for tests and offline demos.

Slide 20 of the deck: protocol-typed deps make fakes trivial. The Fake never
spawns a subprocess — it pops the next scripted `AdapterResult` from a queue.

Usage:

    from coterie.adapters.fake import FakeAdapter
    FakeAdapter.script("agent-1", [AdapterResult("hello", "", 0)])

    # ...then any FakeAdapter constructed with agent_id="agent-1" will return
    # the scripted result on its next .run() call.

Reset between tests with `FakeAdapter.reset_all()`.
"""

from collections import deque
from typing import ClassVar, Iterable

from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.core.registry import register_adapter


class FakeAdapterError(RuntimeError):
    """Raised when FakeAdapter is called with no remaining scripted results."""


@register_adapter
class FakeAdapter(CLIAdapter):
    name: ClassVar[str] = "fake"

    # Class-level scripts keyed by agent_id so multiple FakeAdapter instances
    # in the same graph can have independent queues.
    _scripts: ClassVar[dict[str, deque[AdapterResult]]] = {}
    _invocations: ClassVar[dict[str, list[dict]]] = {}

    @classmethod
    def script(cls, agent_id: str, results: Iterable[AdapterResult]) -> None:
        cls._scripts[agent_id] = deque(results)
        cls._invocations.setdefault(agent_id, [])

    @classmethod
    def invocations_for(cls, agent_id: str) -> list[dict]:
        return cls._invocations.get(agent_id, [])

    @classmethod
    def reset_all(cls) -> None:
        cls._scripts.clear()
        cls._invocations.clear()

    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]:
        # Never invoked — we short-circuit `run()`.
        return ["true"]

    def parse_result(self, stdout: str, stderr: str, exit_code: int) -> AdapterResult:
        return AdapterResult(stdout, stderr, exit_code)

    def run(
        self,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
        extra: dict | None = None,
    ) -> AdapterResult:
        self._invocations.setdefault(self.agent_id, []).append(
            {"prompt": prompt, "workdir": workdir}
        )
        queue = self._scripts.get(self.agent_id)
        if not queue:
            raise FakeAdapterError(
                f"FakeAdapter({self.agent_id!r}) has no scripted results remaining; "
                f"prior invocations: {len(self._invocations.get(self.agent_id, []))}"
            )
        return queue.popleft()
