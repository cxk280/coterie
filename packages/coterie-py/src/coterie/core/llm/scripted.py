"""Test / demo doubles for LLMClient.

Slide 20: protocol-typed deps make fakes trivial. Slide 21: ScriptedLLMClient
ships in the real package so unit tests and offline demos use the same
implementation.
"""

import json
from collections import deque
from pathlib import Path
from typing import Iterable

from coterie.core.llm.base import LLMClient


class ScriptedLLMError(RuntimeError):
    """Raised when a ScriptedLLMClient is called with no remaining responses."""


class ScriptedLLMClient(LLMClient):
    """Replays a queue of pre-recorded responses.

    Two use cases (slide 21):
    1. Unit / integration tests — no API key, no network, deterministic.
    2. Offline demo on stage — agents still run for real, only the LLM round-trip is replayed.
    """

    def __init__(self, responses: Iterable[str]) -> None:
        self._responses: deque[str] = deque(responses)
        self.calls: list[dict] = []

    @classmethod
    def from_fixture(cls, path: str | Path) -> "ScriptedLLMClient":
        data = json.loads(Path(path).read_text())
        if not isinstance(data, list) or not all(isinstance(x, str) for x in data):
            raise ValueError(f"fixture at {path} must be a JSON array of strings")
        return cls(data)

    def queue(self, response: str) -> None:
        self._responses.append(response)

    def chat(self, system: str, messages: list[dict]) -> str:
        self.calls.append({"system": system, "messages": messages})
        if not self._responses:
            raise ScriptedLLMError(
                f"ScriptedLLMClient exhausted after {len(self.calls)} call(s); "
                f"last system prompt: {system[:100]!r}"
            )
        return self._responses.popleft()
