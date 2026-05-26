"""OpenAI Codex CLI adapter."""

from typing import ClassVar

from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.core.registry import register_adapter


@register_adapter
class CodexAdapter(CLIAdapter):
    name: ClassVar[str] = "codex"

    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]:
        # workspace-write sandboxes edits to the cwd; --skip-git-repo-check lets
        # exec run in a plain (non-git) workdir. Autonomous but contained.
        # Override the sandbox via extra["sandbox"].
        sandbox = extra.get("sandbox", "workspace-write")
        cmd = ["codex", "exec", "--skip-git-repo-check", "-s", sandbox]
        if self.model:
            cmd.extend(["--model", self.model])
        cmd.append(prompt)
        return cmd

    def parse_result(self, stdout: str, stderr: str, exit_code: int) -> AdapterResult:
        return AdapterResult(
            stdout=stdout,
            stderr=stderr,
            exit_code=exit_code,
            files_changed=self.git_changed_files("."),
        )
