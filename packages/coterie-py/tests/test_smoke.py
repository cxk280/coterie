"""Smoke tests — no real CLI invocations."""

from coterie import __version__
from coterie.adapters.base import AdapterResult
from coterie.adapters.claude_code import ClaudeCodeAdapter


def test_version() -> None:
    assert __version__ == "0.1.0"


def test_claude_adapter_builds_command() -> None:
    adapter = ClaudeCodeAdapter(agent_id="claude")
    cmd = adapter.build_command("hello", workdir=".", extra={})
    assert cmd[:2] == ["claude", "-p"]
    assert "hello" in cmd
    assert "--output-format" in cmd


def test_claude_adapter_parses_json_payload() -> None:
    adapter = ClaudeCodeAdapter(agent_id="claude")
    payload = '{"result": "ok", "total_cost_usd": 0.0012}'
    result: AdapterResult = adapter.parse_result(payload, "", 0)
    assert result.stdout == "ok"
    assert result.cost_estimate_usd == 0.0012


def test_claude_adapter_falls_back_on_non_json() -> None:
    adapter = ClaudeCodeAdapter(agent_id="claude")
    result = adapter.parse_result("plain text", "warning", 1)
    assert result.stdout == "plain text"
    assert result.stderr == "warning"
    assert result.exit_code == 1
