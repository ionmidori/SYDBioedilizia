"""Quote dossier inputs (Phase 128 PR 1.2): media, site details, client data,
GDPR deletion of the whole quote tree, owner refresh after a guest claim."""
from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch

import pytest
from src.db.projects.deletion import delete_quote_data
from src.schemas.quote import ClientSnapshot, QuoteRequest
from src.services.client_profile import ClientProfile, build_client_snapshot, build_search_keys, get_client_profile
from src.services.quote_dossier import (
    BlobInfo,
    DossierInputs,
    build_media,
    classify_blob,
    format_address,
    media_id_for,
    request_details_from_session,
)
from src.services.quote_drafts import apply_ai_draft, refresh_quote_owner
from tests.unit.firestore_fakes import FakeDb, FakeTransaction
from tests.unit.test_quote_drafts import PID, QUOTE_PATH, _ai_quote, _request

T0 = datetime(2026, 10, 1, 8, 0, tzinfo=UTC)
T1 = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
T2 = datetime(2026, 10, 1, 10, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    "name,ctype,expected",
    [
        (f"user-uploads/{PID}/a1b2.jpg", "image/jpeg", "input_photo"),
        (f"projects/{PID}/uploads/1700_bagno.png", "image/png", "input_photo"),
        (f"projects/{PID}/uploads/clip.mp4", "video/mp4", "video"),
        (f"renders/{PID}/1700-abcd.png", "image/png", "render"),
        (f"projects/{PID}/quotes/quote_1.pdf", "application/pdf", None),
        (f"projects/{PID}/uploads/planimetria.pdf", "application/pdf", None),
        ("user-uploads/other-project/x.jpg", "image/jpeg", None),
    ],
)
def test_classify_blob(name, ctype, expected):
    assert classify_blob(name, ctype, PID) == expected


def test_media_are_ordered_labelled_and_linked_to_their_source_photo():
    photo = f"user-uploads/{PID}/p.jpg"
    render = f"renders/{PID}/r.png"
    blobs = [
        BlobInfo(render, "image/png", T2),
        BlobInfo(f"projects/{PID}/uploads/second.jpg", "image/jpeg", T1),
        BlobInfo(photo, "image/jpeg", T0),
        BlobInfo(f"projects/{PID}/quotes/quote_1.pdf", "application/pdf", T2),
    ]

    media = build_media(blobs, PID, {render: photo})

    assert [(m.label, m.kind) for m in media] == [
        ("Foto 1", "input_photo"),
        ("Foto 2", "input_photo"),
        ("Render 1", "render"),
    ]
    assert media[0].blob_path == photo
    assert media[2].source_media_id == media[0].media_id
    # Opaque, stable ids: no path or file name in what reaches URLs.
    assert media[0].media_id == media_id_for(photo)
    assert "/" not in media[0].media_id and "jpg" not in media[0].media_id


def test_address_and_site_details_from_the_session():
    session = {
        "constructionDetails": {
            "footage_sqm": 7.5,
            "budget_cap": 12000,
            "technical_notes": "Bagno al secondo piano senza ascensore",
            "address": {"street": "Via Roma 1", "city": "Roma", "zip": "00184"},
        }
    }
    assert request_details_from_session(session) == {
        "address": "Via Roma 1, 00184 Roma",
        "footage_sqm": 7.5,
        "budget_cap": 12000,
        "technical_notes": "Bagno al secondo piano senza ascensore",
    }
    assert request_details_from_session({}) == {}
    assert format_address({"street": " ", "city": ""}) is None
    assert format_address("Via Po 3, Torino") == "Via Po 3, Torino"


async def test_guest_uid_has_no_profile_lookup():
    with patch("src.services.client_profile.fb_auth.get_user") as get_user:
        profile = await get_client_profile("guest_abcd1234")
    assert profile == ClientProfile(is_guest=True)
    get_user.assert_not_called()


def test_search_keys():
    snap = build_client_snapshot("u1", ClientProfile(name="Mario De Rossi", email="Mario@Example.it"), T0)
    assert build_search_keys("PRV-2026-0042", snap) == ["prv-2026-0042", "mario", "de", "rossi", "mario@example.it"]
    assert build_search_keys(None, None) == []


def _dossier() -> DossierInputs:
    return DossierInputs(
        client_snapshot=ClientSnapshot(
            uid="uid-1", display_name="Mario Rossi", email="mario@example.it", phone="+39 333", captured_at=T0
        ),
        request_details={"address": "Via Roma 1, 00184 Roma", "footage_sqm": 7.5},
        media=build_media([BlobInfo(f"user-uploads/{PID}/p.jpg", "image/jpeg", T0)], PID, {}),
    )


async def test_created_draft_carries_the_whole_dossier_and_revision_1():
    db = FakeDb()
    await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(), _request(), T1, _dossier())

    doc = db.get_data(*QUOTE_PATH)
    assert doc["client_snapshot"]["display_name"] == "Mario Rossi"
    assert doc["request"] == {
        "summary": "Rifacimento pavimento soggiorno",
        "channel": "chat",
        "session_id": PID,
        "address": "Via Roma 1, 00184 Roma",
        "footage_sqm": 7.5,
    }
    assert [m["label"] for m in doc["media"]] == ["Foto 1"]
    assert "mario" in doc["search_keys"] and "prv-2026-0001" in doc["search_keys"]

    revision = db.get_data(*QUOTE_PATH, "revisions", "1")
    assert revision["version"] == 1
    assert revision["actor_kind"] == "ai"
    assert revision["items"][0]["sku"] == "PAV-001"


async def test_regeneration_writes_revision_2_with_the_admin_notes_in_force():
    db = FakeDb()
    await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(), _request(), T1, _dossier())
    db.docs[QUOTE_PATH]["admin_notes"] = "Sopralluogo martedì"
    db.docs[QUOTE_PATH]["request"]["batch_id"] = "batch-9"

    await apply_ai_draft(FakeTransaction(db), db, PID, _ai_quote(sku="PAV-002"), _request("Altro"), T2, _dossier())

    doc = db.get_data(*QUOTE_PATH)
    assert doc["version"] == 2
    assert doc["request"]["batch_id"] == "batch-9"
    assert doc["request"]["summary"] == "Altro"
    revision = db.get_data(*QUOTE_PATH, "revisions", "2")
    assert revision["items"][0]["sku"] == "PAV-002"
    assert revision["admin_notes"] == "Sopralluogo martedì"
    assert db.get_data(*QUOTE_PATH, "revisions", "1")["items"][0]["sku"] == "PAV-001"  # immutable


async def test_gdpr_deletion_removes_quote_revisions_deliveries_and_hitl_tokens():
    db = FakeDb()
    project = db.collection("projects").document(PID)
    db.put(*QUOTE_PATH, {"status": "sent", "client_snapshot": {"email": "mario@example.it"}})
    db.put(*QUOTE_PATH, "revisions", "1", {"version": 1})
    db.put(*QUOTE_PATH, "deliveries", "d1", {"to": "mario@example.it"})
    db.put("projects", PID, "quotes", "active", {"nonce": "x"})
    db.put("projects", "other", "private_data", "quote", {"status": "draft"})

    await delete_quote_data(db, project)

    assert [p for p in db.docs if p[:2] == ("projects", PID)] == []
    assert db.get_data("projects", "other", "private_data", "quote") == {"status": "draft"}


async def test_claim_moves_the_quote_to_the_registered_client():
    db = FakeDb()
    db.put(*QUOTE_PATH, {"status": "draft", "user_id": "guest_abcd", "quote_number": "PRV-2026-0005"})
    profile = ClientProfile(name="Anna Bianchi", email="anna@example.it")
    with patch("src.services.quote_drafts.get_client_profile", new=AsyncMock(return_value=profile)):
        await refresh_quote_owner(db, PID, "uid-anna")

    doc = db.get_data(*QUOTE_PATH)
    assert doc["user_id"] == "uid-anna"
    assert doc["client_snapshot"]["email"] == "anna@example.it"
    assert doc["search_keys"] == ["prv-2026-0005", "anna", "bianchi", "anna@example.it"]


async def test_claim_without_a_quote_is_a_no_op():
    db = FakeDb()
    with patch("src.services.quote_drafts.get_client_profile", new=AsyncMock()) as lookup:
        await refresh_quote_owner(db, PID, "uid-anna")
    lookup.assert_not_called()
    assert db.docs == {}


def test_request_model_accepts_merged_details():
    QuoteRequest(summary="x", address="Via Roma 1", footage_sqm=7.5, budget_cap=1000, technical_notes="n")
