import json

from coterie.adapters.base import AdapterResult, CLIAdapter


class ClaudeCodeAdapter(CLIAdapter):
    """Wraps the `claude` CLI in headless (`-p`) mode."""

    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]:
        cmd = ["claude", "-p", prompt, "--output-format", "json"]
        if self.model:
            cmd.extend(["--model", self.model])
        return cmd

    def parse_result(self, stdout: str, stderr: str, exit_code: int) -> AdapterResult:
        try:
            payload = json.loads(stdout)
            return AdapterResult(
                stdout=payload.get("result", stdout),
                stderr=stderr,
                exit_code=exit_code,
                cost_estimate_usd=payload.get("total_cost_usd"),
            )
        except json.JSONDecodeError:
            return AdapterResult(stdout=stdout, stderr=stderr, exit_code=exit_code)
