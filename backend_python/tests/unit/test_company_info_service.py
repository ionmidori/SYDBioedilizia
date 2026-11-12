"""CompanyInfoService (Phase 141): the cached company info the AI, the public API, emails and PDFs read."""
import asyncio
import time
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

import pytest
from google.api_core.exceptions import ServiceUnavailable
from src.services import company_info
from src.services import company_info_service as service_module
from src.services.company_info_service import COMPANY_INFO_TTL_SECONDS, CompanyInfoService
from tests.unit.firestore_fakes import FakeDb

NOW = datetime(2026, 11, 11, 10, 0, tzinfo=UTC)
PATH = ("app_config", "company_info")
SEED_PHONE = "+39 375 5463599"


def _stored(phone: str, version: int, updated_at: datetime = NOW) -> dict:
    info = company_info.seed_info()
    info.identity.phone = phone
    return {"info": info.model_dump(mode="json"), "version": version, "updated_by": "admin-a", "updated_at": updated_at}


def _info(phone: str):
    info = company_info.seed_info()
    info.identity.phone = phone
    return info


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()
    monkeypatch.setattr(service_module, "get_async_firestore_client", lambda: fake)
    CompanyInfoService.reset_cache()
    yield fake
    CompanyInfoService.reset_cache()


@pytest.fixture
def live(db):
    """A company info in Firestore and a service that is allowed to refresh."""
    db.put(*PATH, _stored("06 111111111", 3))
    return db


def test_the_ttl_is_five_minutes():
    assert COMPANY_INFO_TTL_SECONDS == 300.0


async def test_a_saved_info_reaches_the_snapshot(live):
    assert CompanyInfoService.snapshot().identity.phone == SEED_PHONE  # the seed, before refreshing
    await CompanyInfoService.ensure_fresh()  # the first load is awaited
    assert CompanyInfoService.snapshot().identity.phone == "06 111111111"
    assert CompanyInfoService.version() == 3
    assert CompanyInfoService.updated_at() == NOW


async def test_the_refresh_is_not_repeated_within_the_ttl(live):
    spy = AsyncMock(wraps=company_info.read_state)
    with patch.object(company_info, "read_state", spy):
        await CompanyInfoService.ensure_fresh()
        await CompanyInfoService.ensure_fresh()
    assert spy.await_count == 1


async def test_after_the_ttl_the_refresh_runs_in_the_background(live):
    await CompanyInfoService.ensure_fresh()
    live.put(*PATH, _stored("06 222222222", 4, NOW + timedelta(minutes=5)))
    CompanyInfoService._refresh_after = time.monotonic() - 1  # TTL elapsed

    gate = asyncio.Event()
    real = company_info.read_state

    async def slow(db):
        await gate.wait()
        return await real(db)

    with patch.object(company_info, "read_state", slow):
        await CompanyInfoService.ensure_fresh()  # returns at once: the request is not delayed
        assert CompanyInfoService.snapshot().identity.phone == "06 111111111"
        gate.set()
        await CompanyInfoService._refresh_task
    assert CompanyInfoService.snapshot().identity.phone == "06 222222222"


async def test_concurrent_expiries_start_a_single_background_refresh(live):
    await CompanyInfoService.ensure_fresh()
    CompanyInfoService._refresh_after = time.monotonic() - 1
    spy = AsyncMock(wraps=company_info.read_state)
    with patch.object(company_info, "read_state", spy):
        await asyncio.gather(*(CompanyInfoService.ensure_fresh() for _ in range(10)))
        await CompanyInfoService._refresh_task
    assert spy.await_count == 1


async def test_when_firestore_is_down_the_previous_info_keeps_serving(live):
    await CompanyInfoService.ensure_fresh()
    CompanyInfoService._refresh_after = time.monotonic() - 1
    with patch.object(company_info, "read_state", AsyncMock(side_effect=ServiceUnavailable("down"))):
        await CompanyInfoService.ensure_fresh()  # must not raise
        await CompanyInfoService._refresh_task
    assert CompanyInfoService.snapshot().identity.phone == "06 111111111"
    assert CompanyInfoService._refresh_after > time.monotonic()  # retried later, not at once


async def test_when_firestore_is_down_at_first_load_the_seed_is_served(db):
    with patch.object(company_info, "read_state", AsyncMock(side_effect=ServiceUnavailable("down"))):
        await CompanyInfoService.ensure_fresh()  # the one awaited attempt, must not raise
    assert CompanyInfoService.snapshot().identity.phone == SEED_PHONE
    assert CompanyInfoService.version() == 0
    CompanyInfoService._refresh_after = time.monotonic() - 1
    started = time.monotonic()
    await CompanyInfoService.ensure_fresh()  # background now: returns immediately
    assert time.monotonic() - started < 0.5


async def test_an_untrusted_document_keeps_the_info_being_served(live):
    await CompanyInfoService.ensure_fresh()
    live.put(*PATH, {"info": {}})  # overwritten by another tool, no version
    CompanyInfoService._refresh_after = time.monotonic() - 1
    await CompanyInfoService.ensure_fresh()
    await CompanyInfoService._refresh_task
    assert CompanyInfoService.snapshot().identity.phone == "06 111111111"


def test_a_slow_older_read_never_replaces_a_newer_save(db):
    CompanyInfoService.apply(_info("06 222222222"), 2, NOW + timedelta(minutes=1))
    CompanyInfoService.apply(_info("06 111111111"), 1, NOW)  # read started before the save
    assert CompanyInfoService.snapshot().identity.phone == "06 222222222"


async def test_with_no_firestore_document_the_seed_keeps_serving(db):
    await CompanyInfoService.ensure_fresh()
    assert CompanyInfoService.snapshot().identity.phone == SEED_PHONE
    assert CompanyInfoService.version() == 0


def test_the_snapshot_is_not_shared_with_callers(db):
    CompanyInfoService.snapshot().identity.phone = "000"
    assert CompanyInfoService.snapshot().identity.phone == SEED_PHONE


async def test_reading_after_the_ttl_starts_a_background_refresh(live):
    """Emails and PDFs only read the snapshot: reading must keep it fresh on every instance."""
    await CompanyInfoService.ensure_fresh()
    live.put(*PATH, _stored("06 333333333", 5, NOW + timedelta(minutes=10)))
    CompanyInfoService._refresh_after = time.monotonic() - 1  # TTL elapsed

    assert CompanyInfoService.snapshot().identity.phone == "06 111111111"  # served at once, never blocks
    assert CompanyInfoService._refresh_task is not None
    await CompanyInfoService._refresh_task
    assert CompanyInfoService.snapshot().identity.phone == "06 333333333"


async def test_reading_within_the_ttl_starts_no_refresh(live):
    await CompanyInfoService.ensure_fresh()
    spy = AsyncMock(wraps=company_info.read_state)
    with patch.object(company_info, "read_state", spy):
        CompanyInfoService.snapshot()
        CompanyInfoService.snapshot()
    assert spy.await_count == 0


async def test_reading_from_a_worker_thread_after_the_ttl_does_not_fail(live):
    """The PDF is built in a thread pool, where no event loop runs."""
    await CompanyInfoService.ensure_fresh()
    CompanyInfoService._refresh_after = time.monotonic() - 1
    CompanyInfoService._refresh_task = None
    phone = await asyncio.to_thread(lambda: CompanyInfoService.snapshot().identity.phone)
    assert phone == "06 111111111"
    assert CompanyInfoService._refresh_task is None
