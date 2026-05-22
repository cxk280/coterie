"""The AdapterExecutor seam.

Following slide 10 of the SOLID Agent Swarms deck (Liskov Substitution): every
place the graph runs an adapter, it goes through an `AdapterExecutor` Protocol.
The Protocol means we can swap concrete executors without touching the graph
code. v0.1 ships `LocalSubprocessExecutor`; v0.2 will add `DockerSwarmExecutor`
to give each fan-out branch its own container (solving the worktree-collision
problem in `consensus` and `tournament` modes).

Slide 27: "Two implementations of one abstraction beats one good implementation."
We're shipping one concrete now but the Protocol exists so the second one can
land as a one-commit diff.
"""

from typing import Protocol

from coterie.adapters.base import AdapterResult, CLIAdapter


class AdapterExecutor(Protocol):
    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
    ) -> AdapterResult:
        ...


class LocalSubprocessExecutor:
    """Default executor: delegates to `adapter.run()`, which spawns a local subprocess.

    Stateless and threadsafe. The same instance can be shared by every node.
    """

    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
    ) -> AdapterResult:
        return adapter.run(prompt, workdir, timeout_s=timeout_s)
