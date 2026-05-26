"""Tracer factory + span helpers.

Lazy: the OTel SDK is imported on first ``setup_tracing()`` call so that
``import coterie`` doesn't pull it in for users who don't want tracing.

The module level globals are deliberately small — a single ``_tracer``
plus the URL template needed to deep-link runs into Langfuse from the
web UI.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger(__name__)


# Cached after first setup_tracing() call.
_tracer: Any = None
_trace_url_template: str | None = None
_provider: Any = None  # TracerProvider for shutdown


def setup_tracing(
    *,
    service_name: str = "coterie",
    config: dict[str, Any] | None = None,
) -> None:
    """Configure the OTel TracerProvider + exporters.

    Idempotent: calling twice is a no-op (logs a debug message). Reads
    config from kwargs ``config`` if provided, else from environment vars.
    """
    global _tracer, _trace_url_template, _provider
    if _tracer is not None:
        logger.debug("setup_tracing(): already configured; skipping")
        return

    cfg = _resolve_config(config)
    if cfg["mode"] == "off":
        _tracer = _NoopTracer()
        return

    try:
        from opentelemetry import trace
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
    except ImportError:
        logger.warning(
            "coterie.observability: opentelemetry not installed; tracing disabled. "
            "`pip install coterie[observability]` to enable."
        )
        _tracer = _NoopTracer()
        return

    resource = Resource.create(
        {
            "service.name": service_name,
            "service.version": _coterie_version(),
        }
    )
    provider = TracerProvider(resource=resource)

    for exporter in _build_exporters(cfg):
        provider.add_span_processor(BatchSpanProcessor(exporter))

    trace.set_tracer_provider(provider)
    _provider = provider
    _tracer = trace.get_tracer("coterie")
    _trace_url_template = cfg.get("trace_url_template")

    logger.info(
        "coterie.observability: tracing enabled (%s, exporters=%s)",
        cfg["mode"],
        ",".join(cfg["exporters"]) or "none",
    )


def shutdown_tracing(timeout_ms: int = 5_000) -> None:
    """Flush pending spans + tear down the provider. Safe to call multiple times."""
    global _tracer, _provider
    if _provider is None:
        return
    try:
        _provider.shutdown()
    except Exception as e:  # noqa: BLE001
        logger.debug("tracer shutdown error: %s", e)
    _provider = None
    _tracer = None


def get_tracer() -> Any:
    """Returns the active tracer. If setup_tracing() wasn't called, returns a no-op."""
    if _tracer is None:
        return _NoopTracer()
    return _tracer


def current_trace_id() -> str | None:
    """Hex trace id of the current span, or None if no active span."""
    try:
        from opentelemetry import trace
    except ImportError:
        return None
    span = trace.get_current_span()
    ctx = span.get_span_context()
    if not ctx.is_valid:
        return None
    return f"{ctx.trace_id:032x}"


def trace_url_for(trace_id: str | None) -> str | None:
    """Deep-link URL for a trace, if the configured exporter supports it."""
    if trace_id is None or _trace_url_template is None:
        return None
    return _trace_url_template.format(trace_id=trace_id)


# ---------- span helpers ----------


@contextmanager
def span_for_run(*, run_id: str, mode: str, task: str) -> Iterator[Any]:
    """Root span: one per Coterie run. Children = LangGraph nodes."""
    with get_tracer().start_as_current_span(
        f"coterie.run.{mode}",
        attributes={
            "coterie.run.id": run_id,
            "coterie.run.mode": mode,
            "coterie.task": _truncate(task),
        },
    ) as span:
        yield span


@contextmanager
def span_for_node(node_name: str, **attrs: Any) -> Iterator[Any]:
    """Span around a single LangGraph node execution."""
    with get_tracer().start_as_current_span(
        f"coterie.node.{node_name}",
        attributes={f"coterie.{k}": _coerce(v) for k, v in attrs.items()},
    ) as span:
        yield span


@contextmanager
def span_for_agent(
    *, agent_id: str, adapter: str, role: str | None = None
) -> Iterator[Any]:
    """Span around a CLI adapter invocation. Cost/duration attached on exit by caller."""
    attrs = {
        "coterie.agent.id": agent_id,
        "coterie.agent.adapter": adapter,
    }
    if role:
        attrs["coterie.agent.role"] = role
    with get_tracer().start_as_current_span("coterie.agent.run", attributes=attrs) as span:
        yield span


@contextmanager
def span_for_llm(
    *, provider: str, model: str, role: str | None = None
) -> Iterator[Any]:
    """Span around an LLMClient.chat() call. Tokens/cost attached by the client."""
    attrs = {
        "coterie.llm.provider": provider,
        "coterie.llm.model": model,
        "gen_ai.system": provider,
        "gen_ai.request.model": model,
    }
    if role:
        attrs["coterie.llm.role"] = role
    with get_tracer().start_as_current_span("coterie.llm.chat", attributes=attrs) as span:
        yield span


# ---------- internals ----------


class _NoopTracer:
    """Stand-in when OTel isn't installed or tracing is disabled."""

    @contextmanager
    def start_as_current_span(self, name: str, attributes: dict[str, Any] | None = None) -> Iterator[Any]:
        yield _NoopSpan()


class _NoopSpan:
    def set_attribute(self, *_a: Any, **_kw: Any) -> None: ...

    def add_event(self, *_a: Any, **_kw: Any) -> None: ...

    def set_status(self, *_a: Any, **_kw: Any) -> None: ...

    def record_exception(self, *_a: Any, **_kw: Any) -> None: ...

    def get_span_context(self):
        class _C:
            is_valid = False
            trace_id = 0

        return _C()


def _resolve_config(override: dict[str, Any] | None) -> dict[str, Any]:
    """Pick exporters from env vars (and optional config override)."""
    cfg = {
        "mode": "off",
        "exporters": [],
        "trace_url_template": None,
    }
    if override and override.get("enabled") is False:
        return cfg

    explicit = (
        (override.get("mode") if override else None)
        or os.environ.get("COTERIE_TRACING")
        or _detect_from_env()
    )
    if explicit == "off":
        return cfg
    if explicit:
        cfg["mode"] = explicit
        cfg["exporters"] = explicit.split(",") if "," in explicit else [explicit]

    if "langfuse" in cfg["exporters"]:
        host = os.environ.get("LANGFUSE_HOST", "http://localhost:3001").rstrip("/")
        cfg["trace_url_template"] = (
            host + "/project/" + os.environ.get("LANGFUSE_PROJECT_ID", "default")
            + "/traces/{trace_id}"
        )
    elif "langsmith" in cfg["exporters"]:
        cfg["trace_url_template"] = (
            "https://smith.langchain.com/o/-/projects/p/"
            + os.environ.get("LANGSMITH_PROJECT", "coterie")
            + "/r/{trace_id}"
        )
    return cfg


def _detect_from_env() -> str | None:
    """Pick a default exporter chain from env vars in priority order."""
    if os.environ.get("LANGFUSE_PUBLIC_KEY") and os.environ.get("LANGFUSE_SECRET_KEY"):
        return "langfuse"
    if os.environ.get("LANGSMITH_API_KEY"):
        return "langsmith"
    if os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT"):
        return "otlp"
    return None


def _build_exporters(cfg: dict[str, Any]) -> list[Any]:
    from opentelemetry.sdk.trace.export import ConsoleSpanExporter

    exporters: list[Any] = []
    for name in cfg["exporters"]:
        if name == "console":
            exporters.append(ConsoleSpanExporter())
        elif name == "langfuse":
            exporters.append(_langfuse_exporter())
        elif name == "langsmith":
            exporters.append(_langsmith_exporter())
        elif name == "otlp":
            exporters.append(_otlp_exporter())
        elif name == "off":
            pass
        else:
            logger.warning("coterie.observability: unknown exporter %r; skipping", name)
    return [e for e in exporters if e is not None]


def _langfuse_exporter() -> Any | None:
    """Send to a Langfuse OTLP/HTTP endpoint. Works with self-hosted or cloud."""
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    except ImportError:
        logger.warning("coterie.observability: opentelemetry-exporter-otlp-proto-http not installed")
        return None

    host = os.environ.get("LANGFUSE_HOST", "http://localhost:3001").rstrip("/")
    public = os.environ.get("LANGFUSE_PUBLIC_KEY", "")
    secret = os.environ.get("LANGFUSE_SECRET_KEY", "")
    if not public or not secret:
        logger.warning(
            "coterie.observability: langfuse exporter requested but "
            "LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY not set"
        )
        return None

    import base64

    creds = base64.b64encode(f"{public}:{secret}".encode()).decode()
    return OTLPSpanExporter(
        endpoint=f"{host}/api/public/otel/v1/traces",
        headers={"Authorization": f"Basic {creds}"},
    )


def _langsmith_exporter() -> Any | None:
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    except ImportError:
        return None

    api_key = os.environ.get("LANGSMITH_API_KEY", "")
    if not api_key:
        return None
    endpoint = os.environ.get("LANGSMITH_ENDPOINT", "https://api.smith.langchain.com/otel/v1/traces")
    project = os.environ.get("LANGSMITH_PROJECT", "coterie")
    return OTLPSpanExporter(
        endpoint=endpoint,
        headers={"x-api-key": api_key, "Langsmith-Project": project},
    )


def _otlp_exporter() -> Any | None:
    try:
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
    except ImportError:
        return None
    return OTLPSpanExporter()


def _truncate(s: str, max_len: int = 256) -> str:
    if len(s) <= max_len:
        return s
    return s[: max_len - 1] + "…"


def _coerce(v: Any) -> Any:
    if isinstance(v, (str, bool, int, float)):
        return v
    if isinstance(v, (list, tuple)):
        return [str(x) for x in v]
    return str(v)


def _coterie_version() -> str:
    try:
        from coterie import __version__

        return __version__
    except Exception:  # noqa: BLE001
        return "0.0.0"
