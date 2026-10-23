"""
Unit tests for src/core/tracing.py: export logging.

Every export batch is logged as `otel_export`, so span delivery can be checked
in Cloud Logging without querying Cloud Trace.
"""
import logging

import pytest
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SpanExporter, SpanExportResult
from src.core import tracing


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
