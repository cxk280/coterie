from coterie.adapters.base import AdapterResult, CLIAdapter
from coterie.adapters.claude_code import ClaudeCodeAdapter

REGISTRY: dict[str, type[CLIAdapter]] = {
    "claude-code": ClaudeCodeAdapter,
}

__all__ = ["AdapterResult", "CLIAdapter", "ClaudeCodeAdapter", "REGISTRY"]
