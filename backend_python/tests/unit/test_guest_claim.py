"""Guest chats follow the guest into their account (Phase 138 PR-6, punto 4).

A guest chats as a Firebase anonymous user: its sessions are owned by the
anonymous uid. Signing in to an EXISTING account changes the uid, so the guest
first gets a claim ticket (proof of being that anonymous user) and the account
then redeems it: every session of the anonymous uid moves to the account.
Knowing a session id is never enough.
"""
import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from google.api_core.exceptions import GoogleAPICallError
from main import app_exception_handler
from src.api.routes import guest_claim as routes
from src.auth.jwt_handler import verify_token
from src.auth.user_lookup import AccountKind
from src.core.exceptions import AppException, GuestClaimDenied
from src.db import transactions
from src.db.session_retention import EXPIRE_AT
from src.schemas.internal import UserSession
from src.services import quote_drafts
from src.services.client_profile import ClientProfile
from src.services.guest_claim import service, tickets
from src.services.guest_claim.transfer import (
    GuestSessions,
    SessionContents,
    count_contents,
    find_guest_sessions,
    move_session,
)
from src.services.user_chat import service as user_chat_service
from tests.unit.firestore_fakes import FakeBucket, FakeDb, FakeTransaction

ANON = "anon-uid-1"
OTHER_ANON = "anon-uid-2"
USER = "user-uid-1"
OTHER_USER = "user-uid-2"
NOW = datetime(2026, 10, 29, 10, 0, tzinfo=UTC)
EXPIRY = NOW + timedelta(days=30)

ANONYMOUS = UserSession(uid=ANON, is_authenticated=True, is_anonymous=True)
REGISTERED = UserSession(uid=USER, email="u@test.com", is_authenticated=True)


@pytest.fixture
def db(monkeypatch):
    fake = FakeDb()

    async def transact(_db, body):
        return await body(FakeTransaction(fake))

    monkeypatch.setattr(transactions, "run_transaction", transact)
    return fake


@pytest.fixture
def kinds(monkeypatch):
    """Account kind of each uid, as Firebase Auth would answer."""
    known = {ANON: AccountKind.ANONYMOUS, OTHER_ANON: AccountKind.ANONYMOUS,
             USER: AccountKind.REGISTERED, OTHER_USER: AccountKind.REGISTERED}

    async def account_kind(uid: str) -> AccountKind:
        return known.get(uid, AccountKind.MISSING)

    monkeypatch.setattr(service, "account_kind", account_kind)
    return known


@pytest.fixture(autouse=True)
def audits(monkeypatch):
    events: list[tuple] = []
    monkeypatch.setattr(service, "emit_audit_event", lambda *args, **kwargs: events.append((args, kwargs)))
    monkeypatch.setattr(user_chat_service, "emit_audit_event", lambda *args, **kwargs: None)
    return events


@pytest.fixture(autouse=True)
def bucket(monkeypatch) -> FakeBucket:
    fake = FakeBucket()
    monkeypatch.setattr(service, "get_storage_client", lambda: fake)
    return fake


@pytest.fixture(autouse=True)
def _profile(monkeypatch):
    async def profile(uid: str) -> ClientProfile:
        return ClientProfile(name="Mario Rossi", email="u@test.com")

    monkeypatch.setattr(quote_drafts, "get_client_profile", profile)


def _seed_session(db: FakeDb, sid: str, owner: str, *, updated: datetime, files: int = 0, messages: int = 0,
                  rooms: int = 0, quote: bool = False) -> None:
    db.put("sessions", sid, {"userId": owner, "title": "Bagno", "updatedAt": updated, EXPIRE_AT: EXPIRY})
    db.put("projects", sid, {"id": sid, "userId": owner, "name": "Bagno"})
    for i in range(messages):
        db.put("sessions", sid, "messages", f"m{i}", {"role": "user", "content": "ciao", EXPIRE_AT: EXPIRY})
    for i in range(files):
        db.put("projects", sid, "files", f"f{i}", {"uploadedBy": owner, "name": f"foto{i}.jpg"})
    for i in range(rooms):
        db.put("projects", sid, "rooms", f"r{i}", {"name": "Bagno"})
    if quote:
        db.put("projects", sid, "private_data", "quote", {"status": "draft", "user_id": owner})


async def _ticket(db: FakeDb, uid: str = ANON, now: datetime = NOW) -> str:
    issued = await service.issue_claim_ticket(db, UserSession(uid=uid, is_authenticated=True, is_anonymous=True),
                                              now=now)
    return issued.ticket


class TestTicket:
    async def test_only_the_hash_of_the_ticket_is_stored(self, db, kinds):
        issued = await service.issue_claim_ticket(db, ANONYMOUS, now=NOW)

        doc_id = hashlib.sha256(issued.ticket.encode()).hexdigest()
        stored = db.get_data(tickets.TICKETS, doc_id)
        assert stored is not None
        assert stored["anonUid"] == ANON
        assert issued.ticket not in str(stored)
        assert issued.expires_at == NOW + tickets.TICKET_TTL

    async def test_a_registered_caller_gets_no_ticket(self, db, kinds):
        with pytest.raises(GuestClaimDenied):
            await service.issue_claim_ticket(db, REGISTERED, now=NOW)

    async def test_an_anonymous_token_of_an_account_since_upgraded_gets_no_ticket(self, db, kinds):
        kinds[ANON] = AccountKind.REGISTERED  # linked after the token was minted

        with pytest.raises(GuestClaimDenied):
            await service.issue_claim_ticket(db, ANONYMOUS, now=NOW)


class TestClaim:
    async def test_every_session_of_the_guest_moves_to_the_account(self, db, kinds, audits):
        """The bug: the guest chatted as an anonymous user, then signed in to an
        existing account — the conversation, files, rooms and quote follow, and
        the guest TTL is gone."""
        _seed_session(db, "old", ANON, updated=NOW - timedelta(days=2), files=2, messages=3, rooms=1, quote=True)
        _seed_session(db, "new", ANON, updated=NOW - timedelta(hours=1), messages=11)
        _seed_session(db, "foreign", OTHER_ANON, updated=NOW, messages=1)
        db.put("projects", "old", "files", "render", {"uploadedBy": "system", "name": "render.png"})
        ticket = await _ticket(db)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert sorted(result.session_ids) == ["new", "old"]
        assert result.open_session_id == "new"  # the most recent conversation
        assert db.get_data("users", USER)["chat_id"] == "new"  # the guest's chat is now the account's
        # A chat with a quote is never merged: it stays a chat of its own.
        assert "merged_into" not in db.get_data("sessions", "old")
        for sid in ("old", "new"):
            session = db.get_data("sessions", sid)
            assert session["userId"] == USER
            assert EXPIRE_AT not in session
            assert db.get_data("projects", sid)["userId"] == USER
        assert all(EXPIRE_AT not in db.get_data("sessions", "new", "messages", f"m{i}") for i in range(11))
        assert db.get_data("projects", "old", "files", "f0")["uploadedBy"] == USER
        assert db.get_data("projects", "old", "files", "render")["uploadedBy"] == "system"
        assert db.get_data("projects", "old", "private_data", "quote")["user_id"] == USER
        assert sorted(args[2] for args, _ in audits) == ["new", "old"]
        assert all(args[0] == "project.claim" and kwargs["user_id"] == USER for args, kwargs in audits)
        # Someone else's guest chat is untouched.
        assert db.get_data("sessions", "foreign")["userId"] == OTHER_ANON
        assert EXPIRE_AT in db.get_data("sessions", "foreign")

    async def test_knowing_a_session_id_is_not_enough(self, db, kinds):
        """A ticket proves only its own anonymous uid: another guest's chat never moves."""
        _seed_session(db, "victim", ANON, updated=NOW, messages=2)
        attacker_ticket = await _ticket(db, OTHER_ANON)

        result = await service.claim_guest_sessions(
            db, UserSession(uid=OTHER_USER, is_authenticated=True), attacker_ticket, now=NOW
        )

        assert result.session_ids == []
        assert db.get_data("sessions", "victim")["userId"] == ANON

    async def test_an_unknown_ticket_is_refused(self, db, kinds):
        with pytest.raises(GuestClaimDenied):
            await service.claim_guest_sessions(db, REGISTERED, "not-a-ticket-at-all-0000000000000", now=NOW)

    async def test_an_expired_ticket_is_refused(self, db, kinds):
        _seed_session(db, "s1", ANON, updated=NOW)
        ticket = await _ticket(db, now=NOW - tickets.TICKET_TTL - timedelta(seconds=1))

        with pytest.raises(GuestClaimDenied):
            await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)
        assert db.get_data("sessions", "s1")["userId"] == ANON

    async def test_a_ticket_redeemed_by_one_account_is_refused_to_another(self, db, kinds):
        _seed_session(db, "s1", ANON, updated=NOW)
        ticket = await _ticket(db)
        await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        with pytest.raises(GuestClaimDenied):
            await service.claim_guest_sessions(db, UserSession(uid=OTHER_USER, is_authenticated=True), ticket, now=NOW)
        assert db.get_data("sessions", "s1")["userId"] == USER

    async def test_claiming_again_gives_the_same_outcome(self, db, kinds):
        _seed_session(db, "s1", ANON, updated=NOW, messages=1)
        ticket = await _ticket(db)

        first = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)
        again = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW + timedelta(minutes=1))

        assert first == again
        assert first.session_ids == ["s1"]

    async def test_a_guest_who_never_wrote_is_a_no_op(self, db, kinds):
        ticket = await _ticket(db)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.session_ids == []
        assert result.open_session_id is None

    async def test_an_anonymous_claimer_is_refused(self, db, kinds):
        ticket = await _ticket(db)

        with pytest.raises(GuestClaimDenied):
            await service.claim_guest_sessions(db, UserSession(uid=OTHER_ANON, is_authenticated=True,
                                                               is_anonymous=True), ticket, now=NOW)

    async def test_a_registered_account_is_never_transferred(self, db, kinds):
        """The ticket's uid became a registered account (linked meanwhile): its
        sessions belong to that account now."""
        _seed_session(db, "s1", ANON, updated=NOW)
        ticket = await _ticket(db)
        kinds[ANON] = AccountKind.REGISTERED

        with pytest.raises(GuestClaimDenied):
            await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)
        assert db.get_data("sessions", "s1")["userId"] == ANON

    async def test_the_upgraded_guest_itself_has_nothing_to_claim(self, db, kinds):
        """Linked account: same uid, the sessions are already its own."""
        _seed_session(db, "s1", ANON, updated=NOW)
        ticket = await _ticket(db)
        kinds[ANON] = AccountKind.REGISTERED

        result = await service.claim_guest_sessions(db, UserSession(uid=ANON, is_authenticated=True), ticket, now=NOW)

        assert result.session_ids == []
        assert db.get_data("sessions", "s1")["userId"] == ANON

    async def test_a_guest_account_deleted_since_the_ticket_still_hands_over_its_chats(self, db, kinds):
        """The ticket proved the anonymous account when it was issued; only a
        registered account keeps its sessions."""
        _seed_session(db, "s1", ANON, updated=NOW)
        ticket = await _ticket(db)
        kinds[ANON] = AccountKind.MISSING

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.session_ids == ["s1"]
        assert db.get_data("sessions", "s1")["userId"] == USER

    async def test_a_retry_finishes_an_interrupted_claim_with_the_planned_outcome(self, db, kinds, monkeypatch):
        _seed_session(db, "new", ANON, updated=NOW)
        _seed_session(db, "old", ANON, updated=NOW - timedelta(days=1))
        ticket = await _ticket(db)
        real_move = service.move_session

        async def fail_on_old(db_, session_id, from_uid, to_uid):
            if session_id == "old":
                raise GoogleAPICallError("write failed")
            await real_move(db_, session_id, from_uid, to_uid)

        monkeypatch.setattr(service, "move_session", fail_on_old)
        with pytest.raises(GoogleAPICallError):
            await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)
        monkeypatch.setattr(service, "move_session", real_move)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.session_ids == ["new", "old"]
        assert result.open_session_id == "new"  # the conversation the guest was having
        assert db.get_data("sessions", "old")["userId"] == USER


class TestOneChat:
    """Phase 139: the account has one chat; the guest's chat ends up in it."""

    async def test_an_account_without_a_chat_adopts_the_guest_chat(self, db, kinds):
        _seed_session(db, "guest-new", ANON, updated=NOW, messages=2)
        _seed_session(db, "guest-old", ANON, updated=NOW - timedelta(days=1), messages=3)
        ticket = await _ticket(db)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.open_session_id == "guest-new"
        assert db.get_data("users", USER)["chat_id"] == "guest-new"
        assert db.get_data("sessions", "guest-old")["merged_into"] == "guest-new"
        assert len([p for p in db.docs if p[:3] == ("sessions", "guest-new", "messages")]) == 5

    async def test_an_account_with_a_chat_receives_the_guest_chat(self, db, kinds):
        _seed_session(db, "account-chat", USER, updated=NOW - timedelta(days=5), messages=4)
        db.docs[("sessions", "account-chat")].pop(EXPIRE_AT)  # a registered chat never expires
        db.put("users", USER, {"chat_id": "account-chat"})
        _seed_session(db, "guest-chat", ANON, updated=NOW, messages=2)
        db.put("projects", "guest-chat", "rooms", "r1", {"room_id": "r1", "label": "Cucina", "room_type": "cucina"})
        ticket = await _ticket(db)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.session_ids == ["guest-chat"]
        assert result.open_session_id == "account-chat"
        assert db.get_data("users", USER)["chat_id"] == "account-chat"
        assert db.get_data("sessions", "guest-chat")["merged_into"] == "account-chat"
        messages = [p for p in db.docs if p[:3] == ("sessions", "account-chat", "messages")]
        assert len(messages) == 6
        assert db.get_data("projects", "account-chat", "rooms", "r1")["label"] == "Cucina"
        # The guest chat came from a guest: once in the account, nothing expires.
        copies = [path for path in messages if path[-1].startswith("m_guest-chat_")]
        assert len(copies) == 2
        assert all(EXPIRE_AT not in db.get_data(*path) for path in copies)

    async def test_an_account_with_chats_but_no_pointer_keeps_its_own_chat(self, db, kinds):
        """Accounts from before Phase 139 have no pointer: their chat is the
        most recent one, and the guest's few messages go into it."""
        _seed_session(db, "account-chat", USER, updated=NOW - timedelta(days=5), messages=4)
        db.docs[("sessions", "account-chat")].pop(EXPIRE_AT)
        _seed_session(db, "guest-chat", ANON, updated=NOW, messages=1)
        ticket = await _ticket(db)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.open_session_id == "account-chat"
        assert db.get_data("users", USER)["chat_id"] == "account-chat"
        assert db.get_data("sessions", "guest-chat")["merged_into"] == "account-chat"

    async def test_a_retry_finishes_an_interrupted_merge(self, db, kinds, monkeypatch):
        _seed_session(db, "account-chat", USER, updated=NOW - timedelta(days=5), messages=1)
        db.put("users", USER, {"chat_id": "account-chat"})
        _seed_session(db, "guest-chat", ANON, updated=NOW, messages=2)
        ticket = await _ticket(db)
        real_merge = service.merge_chat

        async def failing(*args, **kwargs):
            raise GoogleAPICallError("write failed")

        monkeypatch.setattr(service, "merge_chat", failing)
        with pytest.raises(GoogleAPICallError):
            await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)
        monkeypatch.setattr(service, "merge_chat", real_merge)

        result = await service.claim_guest_sessions(db, REGISTERED, ticket, now=NOW)

        assert result.open_session_id == "account-chat"
        assert db.get_data("sessions", "guest-chat")["merged_into"] == "account-chat"
        assert len([p for p in db.docs if p[:3] == ("sessions", "account-chat", "messages")]) == 3


class TestTransfer:
    async def test_files_beyond_one_write_batch_all_move(self, db):
        _seed_session(db, "s1", ANON, updated=NOW, files=950)

        await move_session(db, "s1", ANON, USER)

        assert all(db.get_data("projects", "s1", "files", f"f{i}")["uploadedBy"] == USER for i in range(950))
        assert db.get_data("sessions", "s1")["userId"] == USER

    async def test_counting_writes_nothing(self, db):
        _seed_session(db, "s1", ANON, updated=NOW, files=2, messages=11, rooms=1, quote=True)

        found = await find_guest_sessions(db, ANON)
        contents = await count_contents(db, found, ANON)

        assert found == GuestSessions(session_ids=["s1"], open_session_id="s1")
        assert contents == SessionContents(messages=11, files=2, rooms=1, quotes=1)
        assert db.get_data("sessions", "s1")["userId"] == ANON
        assert EXPIRE_AT in db.get_data("sessions", "s1")

    async def test_a_binned_session_moves_but_is_not_the_one_to_open(self, db):
        _seed_session(db, "binned", ANON, updated=NOW)
        db.docs[("sessions", "binned")]["is_deleted"] = True
        _seed_session(db, "live", ANON, updated=NOW - timedelta(days=1))

        found = await find_guest_sessions(db, ANON)

        assert found == GuestSessions(session_ids=["binned", "live"], open_session_id="live")


def _client(user: UserSession) -> TestClient:
    app = FastAPI()
    app.include_router(routes.router)
    app.add_exception_handler(AppException, app_exception_handler)  # the production error envelope

    async def override_verify_token():
        return user

    app.dependency_overrides[verify_token] = override_verify_token
    return TestClient(app)


class TestRoutes:
    @pytest.fixture(autouse=True)
    def _db(self, db, monkeypatch):
        monkeypatch.setattr(routes, "get_async_firestore_client", lambda: db)

    def test_an_anonymous_user_gets_a_ticket(self, kinds):
        resp = _client(ANONYMOUS).post("/api/guest-claim/ticket")

        assert resp.status_code == 200
        body = resp.json()
        assert len(body["ticket"]) >= 32
        assert "expires_at" in body

    def test_a_registered_user_gets_no_ticket(self, kinds):
        resp = _client(REGISTERED).post("/api/guest-claim/ticket")

        assert resp.status_code == 403
        assert resp.json()["error_code"] == "GUEST_CLAIM_DENIED"

    def test_a_forged_ticket_is_403(self, kinds):
        resp = _client(REGISTERED).post("/api/guest-claim", json={"ticket": "x" * 43})

        assert resp.status_code == 403
        assert resp.json()["error_code"] == "GUEST_CLAIM_DENIED"

    def test_the_claim_moves_the_guest_chat(self, db, kinds):
        _seed_session(db, "s1", ANON, updated=NOW, messages=11)
        ticket = _client(ANONYMOUS).post("/api/guest-claim/ticket").json()["ticket"]

        resp = _client(REGISTERED).post("/api/guest-claim", json={"ticket": ticket})

        assert resp.status_code == 200
        assert resp.json() == {"session_ids": ["s1"], "open_session_id": "s1"}
        assert db.get_data("sessions", "s1")["userId"] == USER

    def test_unknown_fields_are_rejected(self, kinds):
        resp = _client(REGISTERED).post("/api/guest-claim", json={"ticket": "x" * 43, "uid": ANON})

        assert resp.status_code == 422
