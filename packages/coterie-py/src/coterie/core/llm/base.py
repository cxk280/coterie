"""LLMClient ABC.

Interface segregation: one method. Streaming, embeddings, vision would be
separate ABCs if we needed them. The supervisor never sees what it doesn't use.

`chat()` is wrapped in a Coterie tracing span by the ABC, so every provider gets
the same span name + attributes without subclasses having to think about it.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from coterie.observability import span_for_llm


class LLMClient(ABC):
    """Contract for any LLM provider Coterie talks to.

    Subclasses implement ``_chat(system, messages) -> str`` and may set
    ``provider`` / ``model`` attributes for tracing. Anything richer (tool
    calls, structured outputs, streaming) would be a sibling ABC.
    """

    #: Provider name surfaced on spans (e.g. ``anthropic``, ``openai``).
    provider: str = "unknown"
    #: Model id surfaced on spans + by Langfuse for cost mapping.
    model: str = "unknown"

    def chat(self, system: str, messages: list[dict]) -> str:
        """Public entry. Always traced; provider attaches token attrs in _record_usage."""
        with span_for_llm(provider=self.provider, model=self.model) as span:
            try:
                out = self._chat(system, messages)
            except Exception as e:  # noqa: BLE001
                span.record_exception(e)
                raise
            span.set_attribute("coterie.llm.output.length", len(out or ""))
            self._record_usage(span)
            return out

    @abstractmethod
    def _chat(self, system: str, messages: list[dict]) -> str:
        """Provider implementation. Stash usage on ``self._last_usage`` for tracing."""

    def _record_usage(self, span: Any) -> None:
        """Hook for subclasses that capture per-call token/cost metadata."""
        usage = getattr(self, "_last_usage", None)
        if not usage:
            return
        for k, v in usage.items():
            span.set_attribute(f"gen_ai.usage.{k}", v)
