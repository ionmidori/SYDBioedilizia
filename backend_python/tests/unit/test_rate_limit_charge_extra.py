"""Security audit 2026-10-03, L9: the multimodal penalty looked the route up by
URL path (never matched: slowapi keys routes by "module.function") and would
have charged one IP shared by every user. charge_extra() charges the caller's
own bucket."""
from types import SimpleNamespace

from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from slowapi.errors import RateLimitExceeded
from src.core.rate_limit import charge_extra, limiter


def _client() -> TestClient:
    app = FastAPI()
    app.state.limiter = limiter
    limiter.reset()

    @app.post("/media")
    @limiter.limit("6/minute")
    async def media(request: Request):
        try:
            charge_extra(request, f"{media.__module__}.{media.__name__}", cost=4)
        except RateLimitExceeded:
            return {"limited": True}
        return {"limited": False}

    return TestClient(app)


def _limited(client: TestClient, ip: str) -> bool:
    return client.post("/media", headers={"x-forwarded-for": ip}).json()["limited"]


def test_penalty_is_charged_to_the_callers_bucket_only():
    client = _client()
    assert _limited(client, "1.1.1.1") is False  # 1 + 4 = 5 of 6
    assert _limited(client, "1.1.1.1") is True  # 6 + 4 > 6: the penalty bites
    assert _limited(client, "2.2.2.2") is False  # another user is not affected


def test_unknown_endpoint_is_a_no_op():
    charge_extra(SimpleNamespace(method="POST"), "nope.nothing", cost=4)  # type: ignore[arg-type]
