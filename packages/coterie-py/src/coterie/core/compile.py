"""Shared graph compilation helper.

Reads `config.checkpoints` and translates `true`-valued node names into a
LangGraph `interrupt_before` list. When any interrupts are configured, a
checkpointer is wired in so `invoke(None, config=...)` can resume.

The checkpointer is injectable so the API server can substitute a SqliteSaver
for persistence across process restarts; CLI usage gets InMemorySaver.

Mode builders call this instead of `g.compile()` directly.
"""

from typing import Any


def compile_with_interrupts(
    graph_builder,
    config: dict[str, Any],
    *,
    checkpointer: Any | None = None,
):
    interrupts = [
        name
        for name, enabled in (config.get("checkpoints") or {}).items()
        if enabled
    ]
    if not interrupts:
        return graph_builder.compile()

    if checkpointer is None:
        from langgraph.checkpoint.memory import InMemorySaver

        checkpointer = InMemorySaver()

    return graph_builder.compile(
        checkpointer=checkpointer,
        interrupt_before=interrupts,
    )
