"""Per-thread output sink for streaming agent stdout chunks.

A context-variable-backed sink lets the orchestration layer (e.g. the API
runner) subscribe to live subprocess stdout chunks without mutating
``CoterieState`` — keeps the LangGraph checkpoint serialization clean.

The agent_runner reads the sink with ``get_output_sink()`` and threads it
through to the executor as ``on_output``. The runner sets it just before
calling ``graph.stream(...)`` inside the worker thread.
"""

from __future__ import annotations

import contextvars
from typing import Any, Callable

# Sink signature: (context_dict, chunk_str) -> None
OutputSink = Callable[[dict[str, Any], str], None]

_OUTPUT_SINK: contextvars.ContextVar[OutputSink | None] = contextvars.ContextVar(
    "coterie_output_sink", default=None
)


def set_output_sink(sink: OutputSink | None) -> contextvars.Token:
    """Register a sink for the current execution context. Returns a token to reset."""
    return _OUTPUT_SINK.set(sink)


def reset_output_sink(token: contextvars.Token) -> None:
    _OUTPUT_SINK.reset(token)


def get_output_sink() -> OutputSink | None:
    return _OUTPUT_SINK.get()
