"""
OpenTelemetry tracing initialization for SYD Brain API.

Production: exports traces to Google Cloud Trace via CloudTraceSpanExporter.
Development: prints spans to console via ConsoleSpanExporter.

Cloud Run automatically injects the `X-Cloud-Trace-Context` header.
The W3C TraceContext propagator (default) plus GCP propagator ensures
end-to-end trace correlation from the load balancer through to Firestore.

Usage:
    # In main.py lifespan:
    from src.core.tracing import init_tracing, shutdown_tracing
    init_tracing()        # once at startup
    shutdown_tracing()    # once at shutdown (flushes pending spans)

    # In any module:
    from src.core.tracing import get_tracer
    tracer = get_tracer(__name__)
    with tracer.start_as_current_span("my_operation") as span:
        span.set_attribute("user.id", uid)
"""
import logging

from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
from opentelemetry.sdk.resources import Resource

logger = logging.getLogger(__name__)

_SERVICE_NAME = "syd-brain-api"
_provider: TracerProvider | None = None


def init_tracing() -> None:
    """
    Initialize OpenTelemetry tracing.

    - Production: CloudTraceSpanExporter → Google Cloud Trace
    - Development: ConsoleSpanExporter → stdout (human-readable)

    Safe to call multiple times (idempotent).
    """
    global _provider
    if _provider is not None:
        return

    from src.core.config import settings

    resource = Resource.create({
        "service.name": _SERVICE_NAME,
        "service.version": "4.0.17",
        "deployment.environment": settings.ENV,
        "cloud.provider": "gcp",
        "cloud.region": settings.ADK_LOCATION,
    })

    _provider = TracerProvider(resource=resource)

    if settings.ENV == "production":
        try:
            from opentelemetry.exporter.cloud_trace import CloudTraceSpanExporter

            exporter = CloudTraceSpanExporter(
                project_id=settings.GOOGLE_CLOUD_PROJECT,
            )
            _provider.add_span_processor(BatchSpanProcessor(exporter))
            logger.info(
                "[Tracing] Cloud Trace exporter initialized",
                extra={
                    "project_id": settings.GOOGLE_CLOUD_PROJECT,
                    "region": settings.ADK_LOCATION,
                },
            )
        except Exception as e:
            # Non-fatal: fall back to console if Cloud Trace exporter fails
            logger.warning(f"[Tracing] Cloud Trace exporter failed, falling back to console: {e}")
            _provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    else:
        _provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
        logger.info("[Tracing] Console exporter initialized (development mode)")

    trace.set_tracer_provider(_provider)
    logger.info("[Tracing] OpenTelemetry initialized", extra={"service": _SERVICE_NAME})


def shutdown_tracing() -> None:
    """Flush pending spans and shut down the tracer provider."""
    global _provider
    if _provider is not None:
        _provider.shutdown()
        logger.info("[Tracing] OpenTelemetry shut down — spans flushed")
        _provider = None


def get_tracer(name: str) -> trace.Tracer:
    """Get a tracer instance. Falls back to no-op if tracing is not initialized."""
    return trace.get_tracer(name)
