"""OpenTelemetry-based tracing for Coterie.

Every meaningful unit of work — graph runs, LangGraph node executions,
LLM calls, CLI agent invocations — becomes an OTel span. Spans carry
``coterie.*`` semantic attributes (mode, agent_id, model, cost_usd, etc.)
so traces are searchable in any OTel-aware backend.

Exporters supported out of the box:

- **Langfuse** (self-hosted or cloud) via OTLP/HTTP — set
  ``LANGFUSE_HOST`` + ``LANGFUSE_PUBLIC_KEY`` + ``LANGFUSE_SECRET_KEY``.
- **LangSmith** via OTLP/HTTP — set ``LANGSMITH_API_KEY``
  (+ optional ``LANGSMITH_ENDPOINT`` and ``LANGSMITH_PROJECT``).
- **Generic OTLP/HTTP** — set ``OTEL_EXPORTER_OTLP_ENDPOINT``.
- **Console** — set ``COTERIE_TRACING=console`` (dev only).

When no backend env vars are set, tracing falls back to an in-memory
``NoOpTracerProvider``; instrumentation calls are zero-cost.
"""

from coterie.observability.tracer import (
    current_trace_id,
    get_tracer,
    setup_tracing,
    shutdown_tracing,
    span_for_agent,
    span_for_llm,
    span_for_node,
    span_for_run,
    trace_url_for,
)

__all__ = [
    "current_trace_id",
    "get_tracer",
    "setup_tracing",
    "shutdown_tracing",
    "span_for_agent",
    "span_for_llm",
    "span_for_node",
    "span_for_run",
    "trace_url_for",
]
