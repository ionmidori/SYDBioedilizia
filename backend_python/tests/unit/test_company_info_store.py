"""Company info on Firestore (Phase 141): versioned store with history, seed fallback."""
from datetime import UTC, datetime

import pytest
from src.core.exceptions import CompanyInfoConflictError, PreconditionRequiredError
from src.schemas.company_info import CompanyInfo, OpeningHours
from src.services import company_info
from tests.unit.firestore_fakes import FakeDb, FakeTransaction

NOW = datetime(2026, 11, 11, 10, 0, tzinfo=UTC)
PATH = ("app_config", "company_info")


def _history(db: FakeDb) -> list[dict]:
    rows = [d for path, d in db.docs.items() if path[:3] == (*PATH, "history")]
    return sorted(rows, key=lambda d: d["version"])


def _with_hours() -> CompanyInfo:
    info = company_info.seed_info()
    info.hours = [OpeningHours(days="Lun-Ven", opens="09:00", closes="18:00")]
    return info


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(company_info, "_transact", transact)
    return fake


async def test_without_a_document_the_seed_is_served_as_version_zero(db):
    state = await company_info.read_state(db)
    assert (state.source, state.version, state.problem) == ("seed", 0, None)
    assert state.info == company_info.seed_info()


async def test_a_save_creates_the_document_and_a_history_entry(db):
    result = await company_info.save(db, company_info.seed_info(), 0, "admin-a", NOW, reason="Prima versione")

    assert result.version == 1 and result.changed_parts == []
    stored = db.get_data(*PATH)
    assert stored["version"] == 1 and stored["updated_by"] == "admin-a"
    assert CompanyInfo.model_validate(stored["info"]) == company_info.seed_info()
    (entry,) = _history(db)
    assert entry["actor_uid"] == "admin-a" and entry["reason"] == "Prima versione"
    assert entry["changed_parts"] == [] and entry["version"] == 1


async def test_changed_parts_name_what_changed(db):
    result = await company_info.save(db, _with_hours(), 0, "admin-a", NOW)
    assert result.changed_parts == ["hours"]


async def test_a_stale_version_is_a_conflict_and_changes_nothing(db):
    await company_info.save(db, company_info.seed_info(), 0, "admin-a", NOW)
    with pytest.raises(CompanyInfoConflictError) as exc:
        await company_info.save(db, _with_hours(), 0, "admin-b", NOW)
    assert exc.value.status_code == 409 and exc.value.error_code == "VERSION_CONFLICT"
    assert exc.value.detail == {"expected_version": 0, "current_version": 1}
    assert db.get_data(*PATH)["info"]["hours"] == []
    assert len(_history(db)) == 1


async def test_the_saved_info_is_read_back(db):
    await company_info.save(db, _with_hours(), 0, "admin-a", NOW)
    state = await company_info.read_state(db)
    assert (state.source, state.version, state.updated_by) == ("firestore", 1, "admin-a")
    assert state.info.hours[0].opens == "09:00"


@pytest.mark.parametrize(
    ("document", "problem"),
    [
        ({"info": {}}, "legacy_document"),
        ({"info": {}, "version": 0}, "legacy_document"),
        ({"info": {}, "version": True}, "legacy_document"),
        ({"info": "oops", "version": 2}, "legacy_document"),
        ({"info": {"identity": {}}, "version": 2}, "invalid_info"),
    ],
)
async def test_an_untrusted_document_is_ignored_not_served(db, document, problem):
    db.put(*PATH, document)
    state = await company_info.read_state(db)
    assert (state.source, state.version, state.problem) == ("seed", 0, problem)
    assert state.info == company_info.seed_info()


async def test_a_document_saved_with_a_phone_too_short_is_ignored_not_served(db):
    """A phone saved before the 6-digit rule: the seed is served and the console is told why."""
    stored = company_info.seed_info().model_dump(mode="json")
    stored["identity"]["phone"] = "06"
    db.put(*PATH, {"info": stored, "version": 3})
    state = await company_info.read_state(db)
    assert (state.source, state.version, state.problem) == ("seed", 0, "invalid_info")


async def test_saving_over_an_ignored_document_replaces_it_and_never_overwrites_history(db):
    db.put(*PATH, {"info": {}})
    await company_info.save(db, company_info.seed_info(), 0, "admin-a", NOW)
    db.put(*PATH, {"info": {}})
    await company_info.save(db, _with_hours(), 0, "admin-a", NOW)
    assert len(_history(db)) == 2


def test_seed_info_returns_an_independent_copy():
    first = company_info.seed_info()
    first.identity.phone = "000"
    assert company_info.seed_info().identity.phone == "+39 375 5463599"


def test_precondition_message_no_longer_mentions_quotes():
    assert "quote" not in PreconditionRequiredError().message.lower()
