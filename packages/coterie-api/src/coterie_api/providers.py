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


# ---------- key validation ----------
#
# A models-list call exercises the provider's auth layer without spending
# tokens. The key is never logged or echoed back. Powers the web settings
# "Test" button via POST /api/auth/providers/test.

# OpenAI-compatible providers share one SDK; only the base URL differs.
_OPENAI_COMPAT_BASE: dict[str, str | None] = {
    "openai": None,
    "groq": "https://api.groq.com/openai/v1",
    "xai": "https://api.x.ai/v1",
}
KNOWN_PROVIDERS = frozenset({"anthropic", *_OPENAI_COMPAT_BASE})

_VALID = "key is valid"
_AUTH_FAILED = "authentication failed — check the key"


def test_provider_key(provider: str, api_key: str) -> tuple[bool, str]:
    """Return ``(ok, detail)``. Makes a network auth probe; never logs the key."""
    try:
        if provider == "anthropic":
            return _probe_anthropic(api_key)
        if provider in _OPENAI_COMPAT_BASE:
            return _probe_openai_compatible(api_key, _OPENAI_COMPAT_BASE[provider])
        return False, f"unknown provider {provider!r}"
    except Exception as e:  # noqa: BLE001 — return a clean message, never the key
        return False, _safe_message(e)


def _probe_anthropic(api_key: str) -> tuple[bool, str]:
    import anthropic

    try:
        anthropic.Anthropic(api_key=api_key).models.list(limit=1)
        return True, _VALID
    except anthropic.AuthenticationError:
        return False, _AUTH_FAILED


def _probe_openai_compatible(api_key: str, base_url: str | None) -> tuple[bool, str]:
    from openai import AuthenticationError, OpenAI

    try:
        OpenAI(api_key=api_key, base_url=base_url).models.list()
        return True, _VALID
    except AuthenticationError:
        return False, _AUTH_FAILED


def _safe_message(e: Exception) -> str:
    # Keep it short and never echo the request (which carries the key): report
    # the exception type only, not its rendered message.
    return f"{type(e).__name__}: provider or connection error"
