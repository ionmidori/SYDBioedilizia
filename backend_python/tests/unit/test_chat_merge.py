"""A guest's chat merged into the account's chat (Phase 139).

The source is COPIED, never moved: messages, rooms (merged by name), files and
their Storage objects land in the destination with deterministic ids and
rewritten references; the source is then marked `merged_into` and kept.
"""
import json
import logging
from datetime import UTC, datetime, timedelta

import pytest
from src.core.config import settings
from src.db.projects.constants import ARCHIVED_AT, HISTORY_REVISION, MERGED_INTO
from src.services.chat_merge import service
from src.services.chat_merge.media import MediaStore
from src.services.chat_merge.refs import rewrite_refs
from src.services.chat_merge.service import ChatMergeError, merge_chat
from tests.unit.firestore_fakes import FakeBucket, FakeDb, signed_url_of

USER = "user-uid-1"
OTHER = "user-uid-2"
SRC = "uuid-src"
DST = "uuid-dst"
NOW = datetime(2026, 10, 29, 10, 0, tzinfo=UTC)
T0 = NOW - timedelta(days=3)
BUCKET = "test-bucket"

SRC_BLOBS = [
    f"user-uploads/{SRC}/photo1.jpg",
    f"user-uploads/{SRC}/clip.mp4",
    f"renders/{SRC}/1700000000-abcd1234.png",
    f"projects/{SRC}/uploads/plan.jpg",
]
SRC_QUOTE_PDF = f"projects/{SRC}/quotes/PRV-2026-0001_r1.pdf"


@pytest.fixture(autouse=True)
def _bucket_setting(monkeypatch):
    monkeypatch.setattr(settings, "FIREBASE_STORAGE_BUCKET", BUCKET)


@pytest.fixture
def bucket() -> FakeBucket:
    return FakeBucket([*SRC_BLOBS, SRC_QUOTE_PDF, f"user-uploads/{DST}/mine.jpg"])


@pytest.fixture
def media(bucket) -> MediaStore:
    return MediaStore(bucket)


def _room(room_id: str, label: str, room_type: str = "altro", **extra) -> dict:
    return {
        "room_id": room_id, "label": label, "room_type": room_type,
        "created_at": T0, "updated_at": T0, "brief": {}, "reference_photo_id": None, "summary": None,
        **extra,
    }


def _seed(db: FakeDb, *, src_owner: str = USER) -> None:
    db.put("sessions", DST, {"userId": USER, "messageCount": 1, "updatedAt": NOW})
    db.put("projects", DST, {"id": DST, "userId": USER})
    db.put("projects", DST, "rooms", "generale", _room("generale", "Generale"))
    db.put("projects", DST, "rooms", "r-dst-bath", _room("r-dst-bath", "Bagno", "bagno", summary="dest brief"))
    db.put("sessions", DST, "messages", "d1", {"role": "user", "content": "ciao", "timestamp": NOW})

    db.put("sessions", SRC, {"userId": src_owner, "messageCount": 3, "updatedAt": T0})
    db.put("projects", SRC, {"id": SRC, "userId": src_owner})
    db.put("projects", SRC, "rooms", "generale", _room("generale", "Generale"))
    db.put("projects", SRC, "rooms", "r-src-bath", _room("r-src-bath", "il  bagno", "bagno", summary="src brief"))
    db.put("projects", SRC, "rooms", "r-src-kitchen",
           _room("r-src-kitchen", "Cucina", "cucina", reference_photo_id="photo1", summary="kitchen"))
    db.put("projects", SRC, "files", "photo1", {
        "url": signed_url_of(f"user-uploads/{SRC}/photo1.jpg"), "type": "image", "uploadedBy": src_owner,
        "uploadedAt": T0, "roomId": "r-src-kitchen",
        "metadata": {"source": "user_upload", "storage_path": f"user-uploads/{SRC}/photo1.jpg"},
    })
    db.put("projects", SRC, "files", "render1", {
        "url": signed_url_of(f"renders/{SRC}/1700000000-abcd1234.png"), "type": "render",
        "uploadedBy": "assistant", "uploadedAt": T0, "roomId": "r-src-bath",
        "metadata": {"source_file_id": "photo1", "storage_path": f"renders/{SRC}/1700000000-abcd1234.png"},
    })
    db.put("projects", SRC, "files", "plan", {
        "url": signed_url_of(f"projects/{SRC}/uploads/plan.jpg"), "type": "image", "uploadedBy": src_owner,
        "uploadedAt": T0, "projectId": SRC, "roomId": "generale",
        "metadata": {"source": "dashboard_upload", "storage_path": f"projects/{SRC}/uploads/plan.jpg"},
    })
    db.put("sessions", SRC, "messages", "u1", {
        "role": "user", "content": "Ecco la cucina", "timestamp": T0,
        "attachments": {
            "images": [signed_url_of(f"user-uploads/{SRC}/photo1.jpg")],
            "videos": [f"gs://{BUCKET}/user-uploads/{SRC}/clip.mp4"],
        },
        "metadata": {"user_id": src_owner, "room_id": "r-src-kitchen"},
    })
    render_url = signed_url_of(f"renders/{SRC}/1700000000-abcd1234.png")
    db.put("sessions", SRC, "messages", "t1", {
        "role": "tool", "timestamp": T0 + timedelta(seconds=1), "tool_call_id": "call-1",
        "content": json.dumps({"status": "success", "imageUrl": render_url, "file_id": "render1",
                               "source_file_id": "photo1", "room_id": "r-src-bath"}),
    })
    db.put("sessions", SRC, "messages", "a1", {
        "role": "assistant", "content": f"Ecco il render: {render_url}", "timestamp": T0 + timedelta(seconds=2),
        "metadata": {"room_id": "r-src-bath"},
        "tool_calls": [{"id": "call-1", "name": "generate_render", "args": {"room_id": "r-src-bath"}}],
    })


def _ids(db: FakeDb, *path: str) -> set[str]:
    depth = len(path) + 1
    return {p[-1] for p in db.docs if len(p) == depth and p[:-1] == path}


@pytest.fixture
def db() -> FakeDb:
    fake = FakeDb()
    _seed(fake)
    return fake


class TestRefs:
    def _sign(self, path: str) -> str:
        return f"signed:{path}"

    def test_rewrites_every_form_of_a_source_reference(self):
        value = {
            "url": signed_url_of(f"user-uploads/{SRC}/a.jpg"),
            "gs": f"gs://{BUCKET}/renders/{SRC}/r.png",
            "path": f"projects/{SRC}/uploads/p.jpg",
            "text": f"vedi https://storage.googleapis.com/{BUCKET}/user-uploads/{SRC}/a.jpg?x=1 grazie",
            "list": [f"user-uploads/{SRC}/a.jpg"],
        }

        out = rewrite_refs(value, SRC, DST, self._sign)

        assert out == {
            "url": f"signed:user-uploads/{DST}/a.jpg",
            "gs": f"gs://{BUCKET}/renders/{DST}/r.png",
            "path": f"projects/{DST}/uploads/p.jpg",
            "text": f"vedi signed:user-uploads/{DST}/a.jpg grazie",
            "list": [f"user-uploads/{DST}/a.jpg"],
        }

    def test_a_firebase_download_url_keeps_its_token(self):
        """The copy keeps the object's metadata, download token included: the
        permanent URL stays permanent, only its path changes."""
        url = (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/"
               f"projects%2F{SRC}%2Fuploads%2Fp.jpg?alt=media&token=abc")

        out = rewrite_refs(url, SRC, DST, self._sign)

        assert out == (f"https://firebasestorage.googleapis.com/v0/b/{BUCKET}/o/"
                       f"projects%2F{DST}%2Fuploads%2Fp.jpg?alt=media&token=abc")

    def test_punctuation_and_escapes_after_a_url_are_not_part_of_it(self):
        url = f"https://storage.googleapis.com/{BUCKET}/renders/{SRC}/a.png"
        text = f"Ecco il render: {url}. E poi {url}, fine\n{url}"

        out = rewrite_refs(text, SRC, DST, lambda path: f"<{path}>")

        new = f"<renders/{DST}/a.png>"
        assert out == f"Ecco il render: {new}. E poi {new}, fine\n{new}"

    def test_leaves_everything_else_alone(self):
        value = {
            "quote_pdf": f"projects/{SRC}/quotes/PRV.pdf",  # not a media prefix: not copied
            "other_chat": "user-uploads/uuid-other/a.jpg",
            "other_bucket": f"gs://elsewhere/user-uploads/{SRC}/a.jpg",
            "site": "https://example.com/user-uploads/x",
            "n": 3,
            "none": None,
        }

        assert rewrite_refs(value, SRC, DST, self._sign) == value


class TestMerge:
    async def test_copies_the_chat_into_the_destination(self, db, media, bucket):
        report = await merge_chat(db, media, SRC, DST, now=NOW)

        # Storage: media copied to the destination prefixes; the quote PDF stays.
        assert sorted(target for _, target in bucket.copies) == sorted(
            path.replace(f"/{SRC}/", f"/{DST}/") for path in SRC_BLOBS
        )
        # Rooms: "il  bagno" is the destination's "Bagno"; Cucina is new; Generale is Generale.
        assert _ids(db, "projects", DST, "rooms") == {"generale", "r-dst-bath", "r-src-kitchen"}
        assert db.get_data("projects", DST, "rooms", "r-dst-bath")["summary"] == "dest brief"
        kitchen = db.get_data("projects", DST, "rooms", "r-src-kitchen")
        assert (kitchen["label"], kitchen["summary"]) == ("Cucina", "kitchen")

        photo_id = service.copied_file_id(SRC, "photo1")
        render_id = service.copied_file_id(SRC, "render1")
        assert kitchen["reference_photo_id"] == photo_id

        photo = db.get_data("projects", DST, "files", photo_id)
        assert photo["roomId"] == "r-src-kitchen"
        assert photo["metadata"]["storage_path"] == f"user-uploads/{DST}/photo1.jpg"
        assert photo["url"] == signed_url_of(f"user-uploads/{DST}/photo1.jpg")
        assert photo["metadata"]["merged_from"] == SRC
        render = db.get_data("projects", DST, "files", render_id)
        assert render["roomId"] == "r-dst-bath"
        assert render["metadata"]["source_file_id"] == photo_id
        assert render["uploadedBy"] == "assistant"
        plan = db.get_data("projects", DST, "files", service.copied_file_id(SRC, "plan"))
        assert (plan["roomId"], plan["projectId"]) == ("generale", DST)

        user_msg = db.get_data("sessions", DST, "messages", f"m_{SRC}_u1")
        assert user_msg["timestamp"] == T0
        assert user_msg["metadata"]["room_id"] == "r-src-kitchen"
        assert user_msg["metadata"]["merged_from"] == SRC
        assert user_msg["attachments"] == {
            "images": [signed_url_of(f"user-uploads/{DST}/photo1.jpg")],
            "videos": [f"gs://{BUCKET}/user-uploads/{DST}/clip.mp4"],
        }
        new_render_url = signed_url_of(f"renders/{DST}/1700000000-abcd1234.png")
        tool_msg = db.get_data("sessions", DST, "messages", f"m_{SRC}_t1")
        assert json.loads(tool_msg["content"]) == {
            "status": "success", "imageUrl": new_render_url,
            # the ids the model may repeat in a tool call name the copies
            "file_id": render_id, "source_file_id": photo_id, "room_id": "r-dst-bath",
        }
        reply = db.get_data("sessions", DST, "messages", f"m_{SRC}_a1")
        assert reply["content"] == f"Ecco il render: {new_render_url}"
        assert reply["metadata"]["room_id"] == "r-dst-bath"
        assert reply["tool_calls"] == [{"id": "call-1", "name": "generate_render", "args": {"room_id": "r-dst-bath"}}]

        dest = db.get_data("sessions", DST)
        assert dest["messageCount"] == 4
        assert dest[HISTORY_REVISION] == 1
        for collection in ("sessions", "projects"):
            source = db.get_data(collection, SRC)
            assert (source[MERGED_INTO], source[ARCHIVED_AT]) == (DST, NOW)
        # The source is kept as it was.
        assert _ids(db, "sessions", SRC, "messages") == {"u1", "t1", "a1"}
        assert len(_ids(db, "projects", SRC, "files")) == 3
        assert SRC_QUOTE_PDF in bucket.names and all(path in bucket.names for path in SRC_BLOBS)

        assert (report.blobs, report.rooms_created, report.files, report.messages) == (4, 1, 3, 3)
        assert report.already_merged is False

    async def test_guest_expiry_follows_the_destination(self, db, media):
        expiry = NOW + timedelta(days=30)
        db.put("sessions", SRC, "messages", "u1", {"role": "user", "content": "x", "timestamp": T0, "expireAt": expiry})

        await merge_chat(db, media, SRC, DST, now=NOW)

        assert "expireAt" not in db.get_data("sessions", DST, "messages", f"m_{SRC}_u1")

    async def test_running_again_changes_nothing(self, db, media, bucket):
        await merge_chat(db, media, SRC, DST, now=NOW)
        snapshot = {path: data for path, data in db.docs.items()}
        copies = len(bucket.copies)

        report = await merge_chat(db, media, SRC, DST, now=NOW + timedelta(hours=1))

        assert report.already_merged is True
        assert db.docs == snapshot
        assert len(bucket.copies) == copies

    async def test_an_interrupted_merge_is_finished_without_duplicates(self, db, media, bucket, monkeypatch):
        original = service._copy_messages
        calls = {"n": 0}

        async def failing_once(*args, **kwargs):
            calls["n"] += 1
            if calls["n"] == 1:
                raise RuntimeError("instance stopped")
            return await original(*args, **kwargs)

        monkeypatch.setattr(service, "_copy_messages", failing_once)
        with pytest.raises(RuntimeError):
            await merge_chat(db, media, SRC, DST, now=NOW)
        assert MERGED_INTO not in db.get_data("sessions", SRC)

        report = await merge_chat(db, media, SRC, DST, now=NOW)

        assert report.already_merged is False
        assert _ids(db, "projects", DST, "rooms") == {"generale", "r-dst-bath", "r-src-kitchen"}
        assert len(_ids(db, "projects", DST, "files")) == 3
        assert len(_ids(db, "sessions", DST, "messages")) == 4
        assert db.get_data("sessions", DST)[HISTORY_REVISION] == 1
        assert sorted(set(target for _, target in bucket.copies)) == sorted(
            path.replace(f"/{SRC}/", f"/{DST}/") for path in SRC_BLOBS
        )

    async def test_a_new_room_whose_id_is_taken_gets_another(self, db, media):
        db.put("projects", DST, "rooms", "r-src-kitchen", _room("r-src-kitchen", "Studio"))

        await merge_chat(db, media, SRC, DST, now=NOW)

        kitchens = [
            room_id for room_id in _ids(db, "projects", DST, "rooms")
            if db.get_data("projects", DST, "rooms", room_id)["label"] == "Cucina"
        ]
        assert len(kitchens) == 1 and kitchens[0] != "r-src-kitchen"
        photo = db.get_data("projects", DST, "files", service.copied_file_id(SRC, "photo1"))
        assert photo["roomId"] == kitchens[0]


class TestPreconditions:
    async def _refused(self, db, media, source=SRC, dest=DST) -> None:
        before = dict(db.docs)
        with pytest.raises(ChatMergeError):
            await merge_chat(db, media, source, dest, now=NOW)
        assert db.docs == before

    async def test_same_chat(self, db, media):
        await self._refused(db, media, DST, DST)

    async def test_missing_chat(self, db, media):
        await self._refused(db, media, "uuid-missing", DST)

    async def test_other_owner(self, media):
        db = FakeDb()
        _seed(db, src_owner=OTHER)
        await self._refused(db, media)

    async def test_source_with_a_quote(self, db, media):
        db.put("projects", SRC, "private_data", "quote", {"status": "draft", "quote_number": "PRV-2026-0001"})
        await self._refused(db, media)

    async def test_deleted_destination(self, db, media):
        db.put("sessions", DST, {"userId": USER, "is_deleted": True})
        await self._refused(db, media)

    async def test_destination_merged_elsewhere(self, db, media):
        db.put("sessions", DST, {"userId": USER, MERGED_INTO: "uuid-x"})
        await self._refused(db, media)

    async def test_source_merged_elsewhere(self, db, media):
        db.put("sessions", SRC, {"userId": USER, MERGED_INTO: "uuid-x"})
        await self._refused(db, media)

    async def test_too_many_rooms(self, db, media, monkeypatch):
        monkeypatch.setattr(service, "MAX_ROOMS_PER_PROJECT", 2)
        await self._refused(db, media)


async def test_the_merge_is_logged_with_its_counts(db, media, caplog):
    caplog.set_level(logging.INFO, logger=service.__name__)

    await merge_chat(db, media, SRC, DST, now=NOW)

    record, = [r for r in caplog.records if r.getMessage() == "[ChatMerge] Chat merged"]
    assert (record.blobs, record.files, record.merged_messages) == (4, 3, 3)
