"""OpenAI-API-compatible providers (OpenAI, Groq, xAI).

Slide 14 of the deck: three providers in <30 LOC of subclasses by leaning on
their shared API shape. Same trick here. Optional dependency: `pip install
coterie[openai]`.
"""

import os
from typing import ClassVar

from coterie.core.llm.base import LLMClient


class _OpenAICompatibleClient(LLMClient):
    BASE_URL: ClassVar[str | None] = None
    API_KEY_ENV: ClassVar[str] = ""
    DEFAULT_MODEL: ClassVar[str] = ""

    def __init__(self, model: str | None = None, *, max_tokens: int = 1200) -> None:
        try:
            from openai import OpenAI
        except ImportError as e:
            raise ImportError(
                "OpenAI-compatible clients require `openai`. "
                "Install with `pip install coterie[openai]`."
            ) from e
        api_key = os.environ.get(self.API_KEY_ENV)
        if not api_key:
            raise RuntimeError(
                f"{type(self).__name__} requires env var {self.API_KEY_ENV} to be set"
            )
        self._client = OpenAI(api_key=api_key, base_url=self.BASE_URL)
        self.model = model or self.DEFAULT_MODEL
        self.max_tokens = max_tokens

    def chat(self, system: str, messages: list[dict]) -> str:
        full = [{"role": "system", "content": system}, *messages]
        resp = self._client.chat.completions.create(
            model=self.model,
            messages=full,
            max_tokens=self.max_tokens,
        )
        return resp.choices[0].message.content or ""


class OpenAIClient(_OpenAICompatibleClient):
    API_KEY_ENV = "OPENAI_API_KEY"
    DEFAULT_MODEL = "gpt-4o-mini"


class GroqClient(_OpenAICompatibleClient):
    BASE_URL = "https://api.groq.com/openai/v1"
    API_KEY_ENV = "GROQ_API_KEY"
    DEFAULT_MODEL = "llama-3.3-70b-versatile"


class XAIClient(_OpenAICompatibleClient):
    BASE_URL = "https://api.x.ai/v1"
    API_KEY_ENV = "XAI_API_KEY"
    DEFAULT_MODEL = "grok-2-latest"
