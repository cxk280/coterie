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


class DockerSwarmExecutor:
    """Run each adapter invocation inside a fresh Docker container.

    Bind-mounts the workdir into the container at ``/workspace`` and runs the
    adapter's built command there. Each call gets a uniquely-named container
    that's ``docker rm -f``'d in finally — even when the adapter crashes — so
    we don't leak containers.

    The image is configurable via the ``image`` kwarg or
    ``COTERIE_AGENT_IMAGE`` env var. ``network="none"`` is the secure default;
    pass ``"host"`` (or any docker network name) to enable egress.

    Streaming output flows through the same ``run_streaming`` helper as the
    other executors, so the API runner's per-chunk SSE event path Just Works.
    """

    def __init__(
        self,
        *,
        image: str | None = None,
        network: str = "none",
        extra_args: list[str] | None = None,
    ) -> None:
        import os as _os

        self.image = image or _os.environ.get("COTERIE_AGENT_IMAGE", "coterie/agent-base:latest")
        self.network = network
        self.extra_args = list(extra_args or [])

    def execute(
        self,
        adapter: CLIAdapter,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
        on_output: OnOutput | None = None,
    ) -> AdapterResult:
        import time
        import uuid

        from coterie.core.streaming import run_streaming

        cmd = adapter.build_command(prompt, "/workspace", extra={})
        container_name = f"coterie-{uuid.uuid4().hex[:10]}"
        docker_cmd: list[str] = [
            "docker",
            "run",
            "--rm",
            "--name",
            container_name,
            f"--network={self.network}",
            "-v",
            f"{Path(workdir).resolve()}:/workspace",
            "-w",
            "/workspace",
            *self.extra_args,
            self.image,
            *cmd,
        ]
        t0 = time.time()
        try:
            if on_output is not None:
                stream = run_streaming(
                    docker_cmd, cwd=workdir, timeout_s=timeout_s, on_output=on_output
                )
                result = adapter.parse_result(stream.stdout, stream.stderr, stream.exit_code)
                if stream.timed_out:
                    result.stderr = (result.stderr or "") + f"\n[coterie] timeout after {timeout_s}s"
            else:
                proc = subprocess.run(
                    docker_cmd,
                    cwd=workdir,
                    capture_output=True,
                    text=True,
                    timeout=timeout_s,
                    check=False,
                )
                result = adapter.parse_result(proc.stdout, proc.stderr, proc.returncode)
        finally:
            subprocess.run(
                ["docker", "rm", "-f", container_name],
                capture_output=True,
                check=False,
            )
        result.duration_s = time.time() - t0
        return result
