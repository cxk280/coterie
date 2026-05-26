"""Tests for coterie.observability tracing.

Uses ``InMemorySpanExporter`` so the assertions don't depend on a running
backend. setup_tracing() is idempotent so we can't easily reset between
tests — each test that needs a fresh exporter installs its own provider via
the OTel SDK directly.
"""

from __future__ import annotations

import pytest


@pytest.fixture
def in_memory_spans(monkeypatch):
    """Install an InMemorySpanExporter on a fresh TracerProvider for this test.

    Bypasses the OTel global TracerProvider (which can only be set once per
    process) by patching coterie's module-level ``_tracer`` directly with a
    tracer pulled off the test-local provider.
    """
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import SimpleSpanProcessor
    from opentelemetry.sdk.trace.export.in_memory_span_exporter import (
        InMemorySpanExporter,
    )

    provider = TracerProvider()
    exporter = InMemorySpanExporter()
    provider.add_span_processor(SimpleSpanProcessor(exporter))

    import coterie.observability.tracer as tracer_mod

    monkeypatch.setattr(tracer_mod, "_tracer", provider.get_tracer("coterie"))
    yield exporter
    provider.shutdown()


def test_span_for_run_emits_attributes(in_memory_spans):
    from coterie.observability import span_for_run

    with span_for_run(run_id="abc123", mode="adversarial", task="refactor x"):
        pass
    spans = in_memory_spans.get_finished_spans()
    assert len(spans) == 1
    span = spans[0]
    assert span.name == "coterie.run.adversarial"
    assert span.attributes["coterie.run.id"] == "abc123"
    assert span.attributes["coterie.run.mode"] == "adversarial"
    assert span.attributes["coterie.task"] == "refactor x"


def test_span_for_llm_carries_gen_ai_attrs(in_memory_spans):
    from coterie.observability import span_for_llm

    with span_for_llm(provider="anthropic", model="claude-sonnet-4-6", role="judge"):
        pass
    spans = in_memory_spans.get_finished_spans()
    assert any(
        s.attributes.get("gen_ai.request.model") == "claude-sonnet-4-6"
        and s.attributes.get("coterie.llm.role") == "judge"
        for s in spans
    )


def test_span_for_agent_records_outcome(in_memory_spans):
    from coterie.observability import span_for_agent

    with span_for_agent(agent_id="claude-code", adapter="claude-code", role="implementer") as s:
        s.set_attribute("coterie.agent.exit_code", 0)
        s.set_attribute("coterie.agent.duration_s", 1.23)
        s.set_attribute("coterie.cost_usd", 0.04)

    span = in_memory_spans.get_finished_spans()[0]
    assert span.name == "coterie.agent.run"
    assert span.attributes["coterie.agent.id"] == "claude-code"
    assert span.attributes["coterie.agent.exit_code"] == 0
    assert span.attributes["coterie.cost_usd"] == pytest.approx(0.04)


def test_setup_tracing_is_off_by_default(monkeypatch):
    """No env vars + no override → tracing stays in no-op mode."""
    import coterie.observability.tracer as tracer_mod
    from coterie.observability import setup_tracing

    for k in (
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGSMITH_API_KEY",
        "OTEL_EXPORTER_OTLP_ENDPOINT",
        "COTERIE_TRACING",
    ):
        monkeypatch.delenv(k, raising=False)

    monkeypatch.setattr(tracer_mod, "_tracer", None)
    monkeypatch.setattr(tracer_mod, "_provider", None)
    setup_tracing(service_name="test")
    # Re-call: idempotent
    setup_tracing(service_name="test")

    # No provider was created (mode=off → NoopTracer).
    assert tracer_mod._provider is None


def test_langfuse_exporter_builds_when_keys_present(monkeypatch):
    """With LANGFUSE_* env vars present, the exporter is wired and the URL template is set."""
    import coterie.observability.tracer as tracer_mod
    from coterie.observability import setup_tracing, trace_url_for

    monkeypatch.setenv("LANGFUSE_HOST", "http://localhost:3001")
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-test")
    monkeypatch.setenv("LANGFUSE_PROJECT_ID", "coterie")
    monkeypatch.delenv("COTERIE_TRACING", raising=False)

    monkeypatch.setattr(tracer_mod, "_tracer", None)
    monkeypatch.setattr(tracer_mod, "_provider", None)
    monkeypatch.setattr(tracer_mod, "_trace_url_template", None)

    setup_tracing(service_name="test-lf")
    assert tracer_mod._provider is not None

    # Deep-link URL template is filled.
    url = trace_url_for("0123456789abcdef0123456789abcdef")
    assert url == "http://localhost:3001/project/coterie/traces/0123456789abcdef0123456789abcdef"

    tracer_mod._provider.shutdown()
    monkeypatch.setattr(tracer_mod, "_tracer", None)
    monkeypatch.setattr(tracer_mod, "_provider", None)
    monkeypatch.setattr(tracer_mod, "_trace_url_template", None)


def test_llm_client_chat_emits_provider_and_model(in_memory_spans):
    """ScriptedLLMClient is a real LLMClient subclass; chat() goes through the traced wrapper."""
    from coterie.core.llm.scripted import ScriptedLLMClient

    client = ScriptedLLMClient(["hello"])
    out = client.chat("system", [{"role": "user", "content": "hi"}])
    assert out == "hello"

    spans = in_memory_spans.get_finished_spans()
    llm_spans = [s for s in spans if s.name == "coterie.llm.chat"]
    assert llm_spans, "expected at least one coterie.llm.chat span"
    s = llm_spans[0]
    assert s.attributes.get("coterie.llm.provider") == "scripted"
    assert s.attributes.get("coterie.llm.model") == "scripted"
    assert s.attributes.get("coterie.llm.output.length") == 5
