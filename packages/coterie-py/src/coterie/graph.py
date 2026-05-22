"""Mode dispatcher.

Picks a builder from `MODE_REGISTRY` and calls it with the composition root's
wiring. The dispatcher is intentionally thin — all mode wiring lives in the
mode modules.
"""

from typing import Any

from coterie.core.executor import AdapterExecutor
from coterie.core.llm.base import LLMClient
from coterie.core.registry import MODE_REGISTRY


def build_graph(
    *,
    config: dict[str, Any],
    workdir: str = ".",
    executor: AdapterExecutor,
    supervisor_llm: LLMClient | None = None,
    judge_llm: LLMClient | None = None,
    consensus_llm: LLMClient | None = None,
    moderator_llm: LLMClient | None = None,
):
    mode = config.get("mode")
    if not mode:
        raise ValueError("config.mode is required; expected one of " + str(MODE_REGISTRY.names()))
    builder = MODE_REGISTRY.get(mode)
    if builder is None:
        raise ValueError(
            f"unknown mode {mode!r}; available: {MODE_REGISTRY.names()}"
        )
    return builder(
        workdir=workdir,
        executor=executor,
        config=config,
        supervisor_llm=supervisor_llm,
        judge_llm=judge_llm,
        consensus_llm=consensus_llm,
        moderator_llm=moderator_llm,
    )
