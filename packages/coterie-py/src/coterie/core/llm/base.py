"""LLMClient ABC.

Slide 11 (Interface Segregation): tiny interface. One method. Streaming,
embeddings, vision — those would be separate ABCs if we needed them. The
supervisor never sees what it doesn't use.
"""

from abc import ABC, abstractmethod


class LLMClient(ABC):
    """Contract for any LLM provider Coterie talks to.

    Sub-classes implement `chat(system, messages) -> str`. Anything richer
    (tool calls, streaming, structured outputs) would be a sibling ABC, not
    bolted onto this one.
    """

    @abstractmethod
    def chat(self, system: str, messages: list[dict]) -> str:
        """Send a chat completion request.

        `messages` is OpenAI-style: list of {"role": "user"|"assistant", "content": str}.
        Provider adapters translate to native formats internally.
        """
