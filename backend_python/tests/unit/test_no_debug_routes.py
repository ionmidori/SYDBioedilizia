"""No test-automation or debug routes on the production app.

``/api/test/*`` (TestSprite) used to be mounted whenever ``ENV == "development"``
— a single misconfigured env var away from exposing render/vision/CAD tools
without quotas. It was removed together with TestSprite. CI runs with
``ENV=development``, so this check sees the app in exactly the configuration
that used to mount it.

Route discovery must not depend on how FastAPI stores routes: since 0.14x,
``include_router`` keeps an ``_IncludedRouter`` placeholder (path ``""``) in
``app.routes`` instead of flattening, so walking ``app.routes`` alone would miss
every included router — the very way ``test_router`` was mounted. Paths are
therefore collected from the OpenAPI schema (public API) *and* a recursive walk
of the route tree, and a self-test proves the collector still sees a router
included with a forbidden prefix.
"""
from __future__ import annotations

from collections.abc import Iterable, Iterator

from fastapi import APIRouter, FastAPI
from main import app
from starlette.routing import BaseRoute, Mount

FORBIDDEN_SEGMENTS = frozenset({"test", "tests", "debug", "_debug", "__debug"})


def _walk(routes: Iterable[BaseRoute], prefix: str = "") -> Iterator[str]:
    for route in routes:
        path = getattr(route, "path", "") or ""
        yield prefix + path
        if isinstance(route, Mount):
            yield from _walk(route.routes, prefix + path)
        # FastAPI >= 0.14x: include_router() stores an _IncludedRouter wrapper.
        included = getattr(route, "original_router", None)
        if included is not None:
            context = getattr(route, "include_context", None)
            yield from _walk(included.routes, prefix + (getattr(context, "prefix", "") or ""))


def route_paths(application: FastAPI) -> set[str]:
    schema_paths = set(application.openapi().get("paths", {}))
    return schema_paths | {p for p in _walk(application.routes) if p}


def _is_forbidden(path: str) -> bool:
    return any(segment.lower() in FORBIDDEN_SEGMENTS for segment in path.strip("/").split("/"))


def test_no_test_or_debug_routes_mounted() -> None:
    offending = sorted(p for p in route_paths(app) if _is_forbidden(p))
    assert offending == [], f"test/debug routes must not be mounted: {offending}"


def test_collector_sees_included_and_hidden_routers() -> None:
    """Self-test: a router mounted the way test_router was must be detected,
    even when it is hidden from the OpenAPI schema."""
    probe = FastAPI()
    visible = APIRouter(prefix="/api/test")
    hidden = APIRouter(prefix="/internal", include_in_schema=False)

    @visible.post("/tools/x")
    async def _visible() -> None: ...

    @hidden.get("/debug/logs")
    async def _hidden() -> None: ...

    probe.include_router(visible)
    probe.include_router(hidden)

    paths = route_paths(probe)
    assert "/api/test/tools/x" in paths
    assert "/internal/debug/logs" in paths


def test_matcher_catches_nested_segments() -> None:
    assert _is_forbidden("/api/test/tools/x")
    assert _is_forbidden("/test")
    assert _is_forbidden("/api/admin/debug/logs")
    assert not _is_forbidden("/api/testimonials")
    assert not _is_forbidden("/health")
