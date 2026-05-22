"""Anthropic provider."""

from coterie.core.llm.base import LLMClient


class AnthropicClient(LLMClient):
    DEFAULT_MODEL = "claude-haiku-4-5-20251001"
    provider = "anthropic"

    def __init__(self, model: str | None = None, *, max_tokens: int = 1200) -> None:
        try:
            import anthropic
        except ImportError as e:
            raise ImportError(
                "AnthropicClient requires `anthropic`. `pip install coterie[anthropic]` "
                "or the default install which includes it."
            ) from e
        self._client = anthropic.Anthropic()
        self.model = model or self.DEFAULT_MODEL
        self.max_tokens = max_tokens
        self._last_usage: dict[str, int] = {}

    def _chat(self, system: str, messages: list[dict]) -> str:
        resp = self._client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=messages,
        )
        # Stash usage for the base class span hook.
        usage = getattr(resp, "usage", None)
        if usage is not None:
            self._last_usage = {
                "input_tokens": getattr(usage, "input_tokens", 0),
                "output_tokens": getattr(usage, "output_tokens", 0),
            }
        first = resp.content[0]
        return getattr(first, "text", str(first))
