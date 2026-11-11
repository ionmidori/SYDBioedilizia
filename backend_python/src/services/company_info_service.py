"""
The company info every instance serves (Phase 141): a cached copy of
`app_config/company_info`, renewed in the background.

Same design as PricingService (src/services/pricing_service.py), copied rather
than shared so the price book's cache stays untouched: reads are synchronous
and never block on I/O (a read after the TTL starts a background refresh; the
first load is awaited by the startup warm-up), and if
Firestore cannot be read the previous copy (or the seed) keeps serving. The
company info changes rarely, so the TTL is five minutes (owner's choice); the
instance that saves an edit applies it at once.
"""
from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime

from google.api_core.exceptions import GoogleAPIError
from google.auth.exceptions import GoogleAuthError

from src.db.firebase_client import get_async_firestore_client
from src.schemas.company_info import CompanyInfo
from src.services import company_info

logger = logging.getLogger(__name__)

COMPANY_INFO_TTL_SECONDS = 300.0
COMPANY_INFO_RETRY_SECONDS = 15.0
_REFRESH_TIMEOUT_SECONDS = 5.0


class CompanyInfoService:
    _live: CompanyInfo | None = None  # from Firestore, if any
    _live_version: int = 0
    _live_updated_at: datetime | None = None
    _refresh_after: float = 0.0  # time.monotonic() deadline
    _loaded_once: bool = False  # the first load is awaited, later ones run in the background
    _refresh_lock: asyncio.Lock | None = None
    _refresh_task: asyncio.Task[None] | None = None

    @classmethod
    def snapshot(cls) -> CompanyInfo:
        """The company info being served (a copy: callers may mutate it).

        Reading also keeps it fresh: once the TTL has expired, a read made on the
        event loop starts ONE background refresh and returns the current copy at
        once. Emails and PDFs only read the snapshot, so every instance renews it
        without each caller having to remember `ensure_fresh()`.
        """
        cls._refresh_in_background_if_due()
        current = cls._live if cls._live is not None else company_info.seed_info()
        return current.model_copy(deep=True)

    @classmethod
    def _refresh_in_background_if_due(cls) -> None:
        if time.monotonic() < cls._refresh_after:
            return
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return  # a worker thread (e.g. the PDF build): the next read on the loop refreshes
        if cls._refresh_task is None or cls._refresh_task.done():
            cls._refresh_task = loop.create_task(cls.refresh_now())

    @classmethod
    def version(cls) -> int:
        """0 while serving the seed."""
        return cls._live_version if cls._live is not None else 0

    @classmethod
    def updated_at(cls) -> datetime | None:
        return cls._live_updated_at if cls._live is not None else None

    @classmethod
    def apply(cls, info: CompanyInfo, version: int, updated_at: datetime | None = None) -> None:
        """Serve a company info this instance just saved or read.

        Never goes back in time: a slow read of an older save must not replace a
        newer one made while it was in flight (ordered by save time, not version).
        """
        if (
            cls._live is not None
            and updated_at is not None
            and cls._live_updated_at is not None
            and updated_at < cls._live_updated_at
        ):
            return
        cls._live = info.model_copy(deep=True)
        cls._live_version = version
        cls._live_updated_at = updated_at
        cls._loaded_once = True
        cls._refresh_after = time.monotonic() + COMPANY_INFO_TTL_SECONDS

    @classmethod
    def reset_cache(cls) -> None:
        cls._live = None
        cls._live_version = 0
        cls._live_updated_at = None
        cls._refresh_after = 0.0
        cls._loaded_once = False
        cls._refresh_lock = None
        cls._refresh_task = None

    @classmethod
    async def ensure_fresh(cls) -> None:
        """Keep the company info current without slowing a request. Never raises.

        The very first call (normally the startup warm-up) waits for Firestore.
        After that, an expired TTL starts ONE background refresh and callers keep
        the copy they have.
        """
        if time.monotonic() < cls._refresh_after:
            return
        if not cls._loaded_once:
            await cls.refresh_now()
            return
        if cls._refresh_task is None or cls._refresh_task.done():
            cls._refresh_task = asyncio.get_running_loop().create_task(cls.refresh_now())

    @classmethod
    async def refresh_now(cls) -> None:
        """Read the company info from Firestore now. Never raises."""
        if cls._refresh_lock is None:
            cls._refresh_lock = asyncio.Lock()
        async with cls._refresh_lock:
            if time.monotonic() < cls._refresh_after:
                return  # another caller refreshed it while this one waited
            cls._loaded_once = True  # one attempt, success or not, ends the blocking first load
            try:
                state = await asyncio.wait_for(
                    company_info.read_state(get_async_firestore_client()), _REFRESH_TIMEOUT_SECONDS
                )
            except (GoogleAPIError, GoogleAuthError, OSError, RuntimeError, ValueError) as exc:
                logger.warning(
                    "[CompanyInfo] Refresh failed, keeping the current company info [%s].", type(exc).__name__
                )
                cls._refresh_after = time.monotonic() + COMPANY_INFO_RETRY_SECONDS
                return
            if state.problem is not None:
                # The stored document cannot be trusted (already logged): keep what is being served.
                cls._refresh_after = time.monotonic() + COMPANY_INFO_TTL_SECONDS
            elif state.source == "firestore":
                cls.apply(state.info, state.version, state.updated_at)
            else:
                cls._live = None
                cls._live_version = 0
                cls._live_updated_at = None
                cls._refresh_after = time.monotonic() + COMPANY_INFO_TTL_SECONDS
