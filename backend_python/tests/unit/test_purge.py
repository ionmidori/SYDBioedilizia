"""Low-level erasure helpers: whole document trees, queries, Storage prefixes."""
import pytest
from src.db import purge
from src.db.purge import delete_document_tree, delete_query, delete_storage_prefix
from src.db.storage_paths import project_storage_prefixes, user_storage_prefixes
from src.utils.download import session_storage_prefixes
from tests.unit.firestore_fakes import FakeBucket, FakeDb


def _project(db: FakeDb, pid: str = "p1") -> None:
    db.put("projects", pid, {"userId": "u1", "name": "Bagno"})
    db.put("projects", pid, "files", "f1", {"url": "x"})
    db.put("projects", pid, "private_data", "quote", {"user_id": "u1"})
    db.put("projects", pid, "private_data", "quote", "revisions", "1", {"items": []})
    db.put("projects", pid, "private_data", "quote", "deliveries", "d1", {"to": "a@b.it"})


class TestDeleteDocumentTree:
    async def test_deletes_the_document_and_every_nested_subcollection(self):
        db = FakeDb()
        _project(db)
        db.put("projects", "other", {"userId": "u2"})

        deleted = await delete_document_tree(db, db.collection("projects").document("p1"))

        assert deleted == 5
        assert [p for p in db.docs if p[1] == "p1"] == []
        assert db.get_data("projects", "other") == {"userId": "u2"}

    async def test_reaches_subcollections_of_a_missing_parent(self):
        # Firestore keeps subcollections when the parent document is deleted.
        db = FakeDb()
        db.put("projects", "p1", "private_data", "quote", "deliveries", "d1", {"to": "a@b.it"})

        assert await delete_document_tree(db, db.collection("projects").document("p1")) == 1
        assert db.docs == {}

    async def test_kept_documents_survive_with_their_subtree(self):
        db = FakeDb()
        _project(db)

        def keep(ref) -> bool:
            return ref.parent.id == "private_data" and ref.id == "quote"

        await delete_document_tree(db, db.collection("projects").document("p1"), keep=keep)

        assert db.get_data("projects", "p1") is None
        assert db.get_data("projects", "p1", "files", "f1") is None
        assert db.get_data("projects", "p1", "private_data", "quote") == {"user_id": "u1"}
        assert db.get_data("projects", "p1", "private_data", "quote", "revisions", "1") is not None
        assert db.get_data("projects", "p1", "private_data", "quote", "deliveries", "d1") is not None

    async def test_writes_in_bounded_batches(self, monkeypatch):
        monkeypatch.setattr(purge, "_BATCH_SIZE", 2)
        db = FakeDb()
        for i in range(5):
            db.put("sessions", "s1", "messages", f"m{i}", {"content": i})

        assert await delete_document_tree(db, db.collection("sessions").document("s1")) == 5
        assert db.docs == {}

    async def test_missing_tree_is_a_no_op(self):
        db = FakeDb()
        assert await delete_document_tree(db, db.collection("projects").document("nope")) == 0


class TestDeleteQuery:
    async def test_deletes_only_the_matching_documents(self):
        db = FakeDb()
        db.put("leads", "a", {"uid": "u1"})
        db.put("leads", "b", {"uid": "u1"})
        db.put("leads", "c", {"uid": "u2"})

        deleted = await delete_query(db, db.collection("leads").where("uid", "==", "u1"))

        assert deleted == 2
        assert list(db.docs) == [("leads", "c")]


class TestDeleteStoragePrefix:
    async def test_deletes_every_object_under_the_prefix(self):
        bucket = FakeBucket(["user-uploads/p1/a.mp4", "user-uploads/p1/b.jpg", "user-uploads/p10/c.jpg"])

        assert await delete_storage_prefix(bucket, "user-uploads/p1/") == 2
        assert bucket.names == {"user-uploads/p10/c.jpg"}

    async def test_kept_objects_survive(self):
        bucket = FakeBucket(["projects/p1/uploads/a.jpg", "projects/p1/quotes/PRV-2026-0001_r1.pdf"])

        deleted = await delete_storage_prefix(
            bucket, "projects/p1/", keep=frozenset({"projects/p1/quotes/PRV-2026-0001_r1.pdf"})
        )

        assert deleted == 1
        assert bucket.names == {"projects/p1/quotes/PRV-2026-0001_r1.pdf"}

    @pytest.mark.parametrize("prefix", ["", "user-uploads", "/"])
    async def test_a_prefix_that_could_match_the_whole_bucket_is_refused(self, prefix):
        bucket = FakeBucket(["user-uploads/p1/a.jpg", "portfolio/b.jpg"])

        with pytest.raises(ValueError):
            await delete_storage_prefix(bucket, prefix)
        assert len(bucket.names) == 2

    async def test_storage_errors_propagate(self):
        # Fail closed: an erasure step must not report success with files left behind.
        with pytest.raises(RuntimeError):
            await delete_storage_prefix(FakeBucket(["renders/p1/a.png"], fail_on="renders/"), "renders/p1/")


class TestStoragePaths:
    def test_project_prefixes_cover_every_writer(self):
        assert project_storage_prefixes("p1") == (
            "user-uploads/p1/",
            "projects/p1/",
            "renders/p1/",
            "documents/p1/",
        )

    def test_project_prefixes_include_what_the_session_may_read(self):
        assert set(session_storage_prefixes("p1")) <= set(project_storage_prefixes("p1"))

    def test_user_prefixes(self):
        assert user_storage_prefixes("u1") == ("users/u1/",)

    @pytest.mark.parametrize("bad", ["", "a/b", "..", "p1/"])
    def test_ids_that_could_widen_a_prefix_are_refused(self, bad):
        # An empty or slashed id would turn "user-uploads/{id}/" into a much wider prefix.
        with pytest.raises(ValueError):
            project_storage_prefixes(bad)
        with pytest.raises(ValueError):
            user_storage_prefixes(bad)
