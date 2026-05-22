import subprocess
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class AdapterResult:
    stdout: str
    stderr: str
    exit_code: int
    files_changed: list[str] = field(default_factory=list)
    duration_s: float = 0.0
    cost_estimate_usd: float | None = None


class CLIAdapter(ABC):
    agent_id: str

    def __init__(self, agent_id: str, *, model: str | None = None) -> None:
        self.agent_id = agent_id
        self.model = model

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
    ) -> AdapterResult:
        cmd = self.build_command(prompt, workdir, extra=extra or {})
        t0 = time.time()
        proc = subprocess.run(
            cmd,
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=timeout_s,
            check=False,
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
