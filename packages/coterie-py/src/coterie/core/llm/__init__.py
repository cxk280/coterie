"""LLM provider abstractions.

The `LLMClient` ABC (base.py) is what every node depends on. Concrete providers
(Anthropic, OpenAI, Groq, xAI) sit beside it and the composition root in `cli.py`
picks one based on config + env vars.
"""

from coterie.core.llm.base import LLMClient

__all__ = ["LLMClient"]
