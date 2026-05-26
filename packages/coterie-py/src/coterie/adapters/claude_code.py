"""Claude Code CLI adapter."""

import json
from typing import ClassVar

from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.core.registry import register_adapter


@register_adapter
class ClaudeCodeAdapter(CLIAdapter):
    name: ClassVar[str] = "claude-code"
    # Run on the user's Claude subscription (OAuth session), not a pay-per-token
    # API key — Coterie's coordination LLMs use ANTHROPIC_API_KEY in-process, but
    # the agent CLI should bill against the subscription.
    strip_env: ClassVar[tuple[str, ...]] = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")

    def build_command(self, prompt: str, workdir: str, *, extra: dict) -> list[str]:
        # acceptEdits lets the agent apply file edits without a prompt (the only
        # way it can actually do work headlessly) while still gating riskier
        # tools — safe to run against an isolated workdir. Override via
        # extra["permission_mode"] if a caller wants a different posture.
        permission_mode = extra.get("permission_mode", "acceptEdits")
        cmd = ["claude", "-p", prompt, "--output-format", "json", "--permission-mode", permission_mode]
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
