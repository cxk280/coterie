"""The AdapterExecutor seam.

Every place the graph runs an adapter goes through an ``AdapterExecutor``
Protocol. The Protocol means we can swap concrete executors without touching
the graph code.

v1 ships two concretes:
- ``LocalSubprocessExecutor`` — shares the workdir across calls. Default.
- ``IsolatedWorktreeExecutor`` — each call runs in an ephemeral git worktree
  (or plain tempdir fallback). Used by ``consensus`` and ``tournament`` so
  parallel agents don't clobber each other's edits.

``DockerSwarmExecutor`` (each branch in its own container) is the next
implementation; it lands without touching graph code because of this seam.

Both shipped executors forward an optional ``on_output`` callback to the
adapter — the orchestration layer wires this through so live UIs can tail
subprocess stdout chunk-by-chunk.
"""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Callable, Protocol

from coterie.adapters.base import AdapterResult, CLIAdapter

logger = logging.getLogger(__name__)

OnOutput = Callable[[str], None]


class AdapterExecutor(Protocol):
    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
        on_output: OnOutput | None = None,
    ) -> AdapterResult:
        ...


class LocalSubprocessExecutor:
    """Default executor: delegates to ``adapter.run()``.

    Stateless and threadsafe. The same instance can be shared by every node.
    When ``on_output`` is supplied, the adapter spawns under a PTY (Unix)
    and streams stdout chunks to the callback as they arrive.
    """

    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
        on_output: OnOutput | None = None,
    ) -> AdapterResult:
        return adapter.run(prompt, workdir, timeout_s=timeout_s, on_output=on_output)


class IsolatedWorktreeExecutor:
    """Each ``execute()`` call runs in an ephemeral, isolated workdir.

    If the supplied workdir is a git repo, uses ``git worktree add --detach``
    to create a checkout the agent can edit freely without colliding with
    sibling branches. Falls back to a plain ``tempfile.mkdtemp`` directory
    when the workdir isn't a git repo (still isolated; just no git history).

    Cleanup runs in a finally so a crashing adapter doesn't leak worktrees.
    """

    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
        on_output: OnOutput | None = None,
    ) -> AdapterResult:
        isolated = self._make_isolated(workdir)
        try:
            return adapter.run(prompt, isolated, timeout_s=timeout_s, on_output=on_output)
        finally:
            self._cleanup(isolated, base=workdir)

    @staticmethod
    def _make_isolated(base: str) -> str:
        d = tempfile.mkdtemp(prefix="coterie-wt-")
        base_path = Path(base)
        if (base_path / ".git").exists():
            proc = subprocess.run(
                ["git", "worktree", "add", "--detach", d],
                cwd=base,
                capture_output=True,
                text=True,
                check=False,
            )
            if proc.returncode == 0:
                return d
            logger.warning(
                "git worktree add failed (%s); falling back to plain tempdir",
                proc.stderr.strip(),
            )
        return d

    @staticmethod
    def _cleanup(isolated: str, *, base: str) -> None:
        subprocess.run(
            ["git", "worktree", "remove", "--force", isolated],
            cwd=base,
            capture_output=True,
            check=False,
        )
        shutil.rmtree(isolated, ignore_errors=True)
