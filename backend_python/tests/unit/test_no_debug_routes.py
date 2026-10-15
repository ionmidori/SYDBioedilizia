"""No test-automation or debug routes on the production app.

``/api/test/*`` (TestSprite) used to be mounted whenever ``ENV == "development"``
— a single misconfigured env var away from exposing render/vision/CAD tools
without quotas. It was removed together with TestSprite. CI runs with
``ENV=development``, so this check sees the app in exactly the configuration
that used to mount it.

Every route kind is inspected (HTTP, WebSocket, mounted sub-apps, recursively)
and a ``test``/``debug`` segment is rejected at any depth, not only as prefix.
"""
from __future__ import annotations

from collections.abc import Iterable, Iterator

from main import app
from starlette.routing import BaseRoute, Mount

FORBIDDEN_SEGMENTS = frozenset({"test", "tests", "debug", "_debug", "__debug"})


def _paths(routes: Iterable[BaseRoute], prefix: str = "") -> Iterator[str]:
    for route in routes:
        path = prefix + getattr(route, "path", "")
        yield path
        if isinstance(route, Mount):
            yield from _paths(route.routes, path)


def _is_forbidden(path: str) -> bool:
    return any(segment.lower() in FORBIDDEN_SEGMENTS for segment in path.strip("/").split("/"))


def test_no_test_or_debug_routes_mounted() -> None:
    offending = sorted({p for p in _paths(app.routes) if _is_forbidden(p)})
    assert offending == [], f"test/debug routes must not be mounted: {offending}"


def test_guard_detects_nested_and_mounted_paths() -> None:
    # The matcher itself must catch the shapes a prefix check would miss.
    assert _is_forbidden("/api/test/tools/x")
    assert _is_forbidden("/test")
    assert _is_forbidden("/api/admin/debug/logs")
    assert not _is_forbidden("/api/testimonials")
    assert not _is_forbidden("/health")
