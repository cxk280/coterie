"""The AdapterExecutor seam.

Following slide 10 of the SOLID Agent Swarms deck (Liskov Substitution): every
place the graph runs an adapter, it goes through an `AdapterExecutor` Protocol.
The Protocol means we can swap concrete executors without touching the graph
code.

v0.1 ships two concretes:
- `LocalSubprocessExecutor` — shares the workdir across all calls. Default.
- `IsolatedWorktreeExecutor` — each call runs in an ephemeral git worktree
  (or plain tempdir fallback). Used by `consensus` and `tournament` modes so
  parallel agents don't clobber each other's edits.

v0.2 will add `DockerSwarmExecutor` — same Protocol; each branch in its own
container. Slide 27: "Two implementations of one abstraction beats one good
implementation." Two ship today; the third lands without touching graph code.
"""

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Protocol

from coterie.adapters.base import AdapterResult, CLIAdapter

logger = logging.getLogger(__name__)


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
    All adapter invocations share the same workdir.
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


class IsolatedWorktreeExecutor:
    """Each `execute()` call runs in an ephemeral, isolated workdir.

    If the supplied workdir is a git repo, uses `git worktree add --detach` to
    create a checkout the agent can edit freely without colliding with sibling
    branches. Falls back to a plain `tempfile.mkdtemp` directory when the
    workdir isn't a git repo (still isolated; just no git history).

    Cleanup runs in a finally so a crashing adapter doesn't leak worktrees.

    Trade-off: each adapter sees a fresh checkout, so file artifacts produced
    by one branch aren't visible to a sibling branch. That's the whole point.
    The judge / engine reads from `AgentRun.stdout` and `files_changed`, both
    of which are captured before cleanup.
    """

    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
    ) -> AdapterResult:
        isolated = self._make_isolated(workdir)
        try:
            return adapter.run(prompt, isolated, timeout_s=timeout_s)
        finally:
            self._cleanup(isolated, base=workdir)

    @staticmethod
    def _make_isolated(base: str) -> str:
        d = tempfile.mkdtemp(prefix="coterie-wt-")
        base_path = Path(base)
        # `.git` may be a dir (normal) or a file (submodule / worktree). Either counts.
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
        # If it's a worktree, ask git to detach it first so its admin state is sane.
        subprocess.run(
            ["git", "worktree", "remove", "--force", isolated],
            cwd=base,
            capture_output=True,
            check=False,
        )
        shutil.rmtree(isolated, ignore_errors=True)
