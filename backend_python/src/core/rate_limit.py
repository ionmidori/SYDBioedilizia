"""
Shared slowapi Limiter instance.

Import this in main.py AND in every router that needs rate limiting,
so they all share the same limiter registered in app.state.limiter.
"""
from __future__ import annotations

from typing import TYPE_CHECKING

from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

if TYPE_CHECKING:
    from starlette.requests import Request


def _client_key(request: Request) -> str:
    """Rate-limit key resolver (hardened — L-1).

    Priority:
      1. Authenticated user id (set on request.state by verify_token). Keying by
         identity is robust to NAT/shared IPs and to X-Forwarded-For spoofing.
      2. The originating client IP from X-Forwarded-For. On Cloud Run the direct
         peer (request.client.host) is the load balancer — identical for every
         user — so get_remote_address alone would make all users share a single
         bucket. The first XFF hop is the original client.
      3. get_remote_address() as a last resort.
    """
    uid = getattr(request.state, "uid", None)
    if uid:
        return f"uid:{uid}"

    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        client_ip = forwarded.split(",")[0].strip()
        if client_ip:
            return f"ip:{client_ip}"

    return f"ip:{get_remote_address(request)}"


limiter = Limiter(key_func=_client_key)


def charge_extra(request: Request, endpoint_key: str, cost: int) -> None:
    """Consume `cost` extra hits of every limit declared on `endpoint_key`
    ("module.function", the key slowapi registers routes under), with the same
    key and scope slowapi uses, so the charge lands on the caller's own bucket.

    Raises RateLimitExceeded when the bucket is exhausted.
    """
    for lim in limiter._route_limits.get(endpoint_key, []):
        scope = lim.scope or endpoint_key
        if lim.per_method:
            scope += f":{request.method}"
        if not limiter.limiter.hit(lim.limit, lim.key_func(request), scope, cost=cost):
            raise RateLimitExceeded(lim)
