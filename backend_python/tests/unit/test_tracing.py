"""
Unit tests for src/core/tracing.py: end-of-turn span flushing and export logging.

Cloud Run allocates CPU only while a request is in flight, so the
BatchSpanProcessor worker (which exports from a background thread after the
response) cannot be relied on: spans are flushed at the end of each chat turn,
while the request is still open.
"""
import logging
import time

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from src.core import tracing


@pytest.fixture
def batched_provider(monkeypatch):
    """A provider whose batch processor would wait a minute before exporting."""
    exporter = InMemorySpanExporter()
    provider = TracerProvider()
    provider.add_span_processor(BatchSpanProcessor(exporter, schedule_delay_millis=60_000))
    monkeypatch.setattr(tracing, "_provider", provider)
    yield provider, exporter
    provider.shutdown()


async def test_flush_spans_exports_queued_spans_without_waiting_for_the_batch_delay(batched_provider):
    provider, exporter = batched_provider
    provider.get_tracer("test").start_span("llm/syd_orchestrator").end()
    assert exporter.get_finished_spans() == ()

    await tracing.flush_spans()

    assert [s.name for s in exporter.get_finished_spans()] == ["llm/syd_orchestrator"]


async def test_flush_spans_is_a_no_op_when_tracing_is_not_initialized(monkeypatch):
    monkeypatch.setattr(tracing, "_provider", None)
    await tracing.flush_spans()  # must not raise


async def test_flush_spans_is_bounded_so_a_slow_export_never_holds_the_chat(batched_provider, monkeypatch, caplog):
    provider, _ = batched_provider
    monkeypatch.setattr(provider, "force_flush", lambda *a, **k: time.sleep(1.0) or True)

    started = time.perf_counter()
    with caplog.at_level(logging.WARNING, logger="src.core.tracing"):
        await tracing.flush_spans(timeout_s=0.05)

    assert time.perf_counter() - started < 0.5
    timeouts = [r for r in caplog.records if getattr(r, "event", None) == "otel_flush_timeout"]
    assert len(timeouts) == 1


class _StubExporter(SpanExporter):
    def __init__(self, result: SpanExportResult) -> None:
        self.result = result
        self.exported: list = []
        self.shut_down = False

    def export(self, spans):
        self.exported.extend(spans)
        return self.result

    def shutdown(self):
        self.shut_down = True


@pytest.mark.parametrize("result", [SpanExportResult.SUCCESS, SpanExportResult.FAILURE])
def test_logging_exporter_logs_every_export_and_returns_the_delegate_result(result, caplog):
    delegate = _StubExporter(result)
    exporter = tracing.LoggingSpanExporter(delegate)
    provider = TracerProvider()
    spans = []
    for name in ("invocation", "call_llm"):
        span = provider.get_tracer("test").start_span(name)
        span.end()
        spans.append(span)

    with caplog.at_level(logging.INFO, logger="src.core.tracing"):
        assert exporter.export(spans) is result

    assert delegate.exported == spans
    records = [r for r in caplog.records if getattr(r, "event", None) == "otel_export"]
    assert len(records) == 1
    assert records[0].spans == 2
    assert records[0].result == result.name
    assert records[0].duration_ms >= 0


def test_logging_exporter_shuts_down_the_delegate():
    delegate = _StubExporter(SpanExportResult.SUCCESS)
    tracing.LoggingSpanExporter(delegate).shutdown()
    assert delegate.shut_down is True
