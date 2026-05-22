"""Anthropic provider."""

from coterie.core.llm.base import LLMClient


class AnthropicClient(LLMClient):
    DEFAULT_MODEL = "claude-haiku-4-5-20251001"

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

    def chat(self, system: str, messages: list[dict]) -> str:
        resp = self._client.messages.create(
            model=self.model,
            max_tokens=self.max_tokens,
            system=system,
            messages=messages,
        )
        first = resp.content[0]
        return getattr(first, "text", str(first))
