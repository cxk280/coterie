"""LLM provider selection — same logic as the coterie CLI composition root.

Centralizes the env-var / model-name → provider mapping so the runner doesn't
have to know about individual clients.
"""

import os

from coterie.core.llm.base import LLMClient


def build_llm(model: str | None) -> LLMClient | None:
    if model is None and not os.environ.get("COTERIE_LLM_PROVIDER"):
        return None
    provider = os.environ.get("COTERIE_LLM_PROVIDER") or _infer_provider(model)
    if provider == "anthropic":
        from coterie.core.llm.anthropic_client import AnthropicClient
        return AnthropicClient(model=model)
    if provider == "openai":
        from coterie.core.llm.openai_compat import OpenAIClient
        return OpenAIClient(model=model)
    if provider == "groq":
        from coterie.core.llm.openai_compat import GroqClient
        return GroqClient(model=model)
    if provider == "xai":
        from coterie.core.llm.openai_compat import XAIClient
        return XAIClient(model=model)
    raise ValueError(f"unknown provider {provider!r}")


def _infer_provider(model: str | None) -> str:
    if not model:
        return "anthropic"
    m = model.lower()
    if m.startswith("claude"):
        return "anthropic"
    if m.startswith(("gpt", "o1", "o3")):
        return "openai"
    if "llama" in m:
        return "groq"
    if "grok" in m:
        return "xai"
    return "anthropic"
