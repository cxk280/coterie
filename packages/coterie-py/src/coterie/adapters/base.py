"""CLIAdapter contract.

Tiny by design: two abstract methods (``build_command`` and ``parse_result``).
Everything else — subprocess spawning, streaming, timing, git-changed-files —
lives in the base class so every concrete adapter inherits identical behavior.

Concrete adapters declare ``name: ClassVar[str]`` and register via
``@register_adapter``.
"""

import os
import subprocess
import time
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import ClassVar

from coterie.core.streaming import run_streaming


@dataclass
class AdapterResult:
    stdout: str
    stderr: str
    exit_code: int
    files_changed: list[str] = field(default_factory=list)
    duration_s: float = 0.0
    cost_estimate_usd: float | None = None


OnOutput = Callable[[str], None]


class CLIAdapter(ABC):
    name: ClassVar[str]  # required on subclasses; used by @register_adapter

    # Env vars stripped from the agent subprocess. Lets an adapter force its CLI
    # onto its own auth (e.g. a subscription session) instead of an API key that
    # Coterie's coordination LLMs need in-process.
    strip_env: ClassVar[tuple[str, ...]] = ()

    def __init__(self, agent_id: str, *, model: str | None = None) -> None:
        self.agent_id = agent_id
        self.model = model

    def _subprocess_env(self) -> dict[str, str] | None:
        if not self.strip_env:
            return None
        return {k: v for k, v in os.environ.items() if k not in self.strip_env}

    @abstractmethod
    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]:
        ...

    @abstractmethod
    def parse_result(self, stdout: str, stderr: str, exit_code: int) -> AdapterResult:
        ...

    def run(
        self,
        prompt: str,
        workdir: str,
        *,
        timeout_s: int = 600,
        extra: dict | None = None,
        on_output: OnOutput | None = None,
    ) -> AdapterResult:
        cmd = self.build_command(prompt, workdir, extra=extra or {})
        env = self._subprocess_env()
        t0 = time.time()

        if on_output is not None:
            stream = run_streaming(
                cmd,
                cwd=workdir,
                timeout_s=timeout_s,
                on_output=on_output,
                env=env,
            )
            result = self.parse_result(stream.stdout, stream.stderr, stream.exit_code)
            if stream.timed_out:
                result.stderr = (result.stderr or "") + f"\n[coterie] timeout after {timeout_s}s"
        else:
            proc = subprocess.run(
                cmd,
                cwd=workdir,
                capture_output=True,
                text=True,
                timeout=timeout_s,
                check=False,
                env=env,
            )
            result = self.parse_result(proc.stdout, proc.stderr, proc.returncode)
        result.duration_s = time.time() - t0
        return result

    @staticmethod
    def git_changed_files(workdir: str) -> list[str]:
        try:
            proc = subprocess.run(
                ["git", "status", "--porcelain"],
                cwd=workdir,
                capture_output=True,
                text=True,
                check=False,
            )
            return [line[3:] for line in proc.stdout.splitlines() if line.strip()]
        except (FileNotFoundError, subprocess.SubprocessError):
            return []
