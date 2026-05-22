"""OpenAI Codex CLI adapter."""

from typing import ClassVar

from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.core.registry import register_adapter


@register_adapter
class CodexAdapter(CLIAdapter):
    name: ClassVar[str] = "codex"

    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]:
        cmd = ["codex", "exec", prompt]
        if self.model:
            cmd.extend(["--model", self.model])
        return cmd

    def parse_result(self, stdout: str, stderr: str, exit_code: int) -> AdapterResult:
        return AdapterResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            files_changed=self.git_changed_files("."),
        )
