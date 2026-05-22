"""Shared graph compilation helper.

Reads `config.checkpoints` and translates `true`-valued node names into a
LangGraph `interrupt_before` list. When any interrupts are configured, a
checkpointer is wired in so `invoke(None, config=...)` can resume.

Mode builders call this instead of `g.compile()` directly.
"""

from typing import Any


def compile_with_interrupts(graph_builder, config: dict[str, Any]):
    """Compile a StateGraph with optional interrupt_before + checkpointer.

    Returns the compiled graph. When `config.checkpoints` is empty / absent,
    returns a plain compile() with no checkpointer (fast path).
    """
    interrupts = [
        name
        for name, enabled in (config.get("checkpoints") or {}).items()
        if enabled
    ]
    if not interrupts:
        return graph_builder.compile()

    # Lazy import — only graphs with interrupts pay the cost.
    from langgraph.checkpoint.memory import InMemorySaver

    return graph_builder.compile(
        checkpointer=InMemorySaver(),
        interrupt_before=interrupts,
    )
