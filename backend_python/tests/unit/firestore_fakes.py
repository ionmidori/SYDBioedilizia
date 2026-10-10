"""Minimal in-memory Firestore doubles for transaction-body unit tests.

Only what the quote domain code uses: collection/document paths, `get` with a
transaction, and `set` / `update` (dotted field paths) on a transaction.
Writes are applied on commit-like `apply()`; the fake also enforces the real
rule that a transaction may not read after it has written.
"""
from __future__ import annotations

import copy
from typing import Any

from google.cloud.firestore_v1 import DELETE_FIELD


class FakeSnapshot:
    def __init__(self, data: dict[str, Any] | None) -> None:
        self._data = copy.deepcopy(data)
        self.exists = data is not None

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._data)


class FakeDocRef:
    def __init__(self, db: FakeDb, path: tuple[str, ...]) -> None:
        self._db = db
        self.path = path

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self._db, (*self.path, name))

    @property
    def reference(self) -> FakeDocRef:
        return self

    async def get(self, transaction: FakeTransaction | None = None) -> FakeSnapshot:
        if transaction is not None:
            transaction.record_read(self.path)
        return FakeSnapshot(self._db.docs.get(self.path))

    async def update(self, data: dict[str, Any]) -> None:
        if self.path not in self._db.docs:
            raise AssertionError(f"update() on missing document {self.path}")
        for key, value in data.items():
            _set_dotted(self._db.docs[self.path], key, copy.deepcopy(value))

    async def delete(self) -> None:
        self._db.docs.pop(self.path, None)

    async def set(self, data: dict[str, Any], merge: bool = False) -> None:
        if merge and self.path in self._db.docs:
            self._db.docs[self.path].update(copy.deepcopy(data))
        else:
            self._db.docs[self.path] = copy.deepcopy(data)


class FakeDocSnapshot(FakeDocRef):
    """What `stream()` yields: a reference that also exposes `id`/`to_dict()`."""

    @property
    def id(self) -> str:
        return self.path[-1]

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._db.docs.get(self.path))


class FakeCollection:
    def __init__(self, db: FakeDb, path: tuple[str, ...]) -> None:
        self._db = db
        self.path = path

    def document(self, doc_id: str) -> FakeDocRef:
        return FakeDocRef(self._db, (*self.path, doc_id))

    _order: tuple[str, bool] | None = None
    _limit: int | None = None

    def limit(self, n: int) -> FakeCollection:
        self._limit = n
        return self

    def order_by(self, field: str, direction: str = "ASCENDING") -> FakeCollection:
        self._order = (field, str(direction).upper().startswith("DESC"))
        return self

    async def stream(self):
        depth = len(self.path) + 1
        paths = [
            p for p in sorted(self._db.docs) if len(p) == depth and p[: len(self.path)] == self.path
        ]
        if self._order:
            field, desc = self._order
            paths.sort(key=lambda p: self._db.docs[p].get(field), reverse=desc)
        for path in paths[: self._limit] if self._limit is not None else paths:
            yield FakeDocSnapshot(self._db, path)


class FakeDb:
    def __init__(self) -> None:
        self.docs: dict[tuple[str, ...], dict[str, Any]] = {}

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self, (name,))

    def put(self, *path_and_data: Any) -> None:
        *path, data = path_and_data
        self.docs[tuple(path)] = copy.deepcopy(data)

    def get_data(self, *path: str) -> dict[str, Any] | None:
        return copy.deepcopy(self.docs.get(tuple(path)))

    def batch(self) -> FakeBatch:
        return FakeBatch(self)


class FakeBatch:
    def __init__(self, db: FakeDb) -> None:
        self._db = db
        self._deletes: list[tuple[str, ...]] = []

    def delete(self, ref: FakeDocRef) -> None:
        self._deletes.append(ref.path)

    async def commit(self) -> None:
        for path in self._deletes:
            self._db.docs.pop(path, None)


def _set_dotted(target: dict[str, Any], dotted: str, value: Any) -> None:
    *parents, leaf = dotted.split(".")
    node = target
    for key in parents:
        node = node.setdefault(key, {})
    # deepcopy may clone the sentinel, so compare by type, not identity.
    if isinstance(value, type(DELETE_FIELD)):
        node.pop(leaf, None)
    else:
        node[leaf] = value


class FakeTransaction:
    """Records reads/writes; applies writes immediately (single-threaded tests)."""

    def __init__(self, db: FakeDb) -> None:
        self._db = db
        self.reads: list[tuple[str, ...]] = []
        self.writes: list[tuple[str, tuple[str, ...], dict[str, Any]]] = []

    def record_read(self, path: tuple[str, ...]) -> None:
        if self.writes:
            raise AssertionError("Firestore transactions must do all reads before writes")
        self.reads.append(path)

    def set(self, ref: FakeDocRef, data: dict[str, Any]) -> None:
        self.writes.append(("set", ref.path, copy.deepcopy(data)))
        self._db.docs[ref.path] = copy.deepcopy(data)

    def update(self, ref: FakeDocRef, data: dict[str, Any]) -> None:
        if ref.path not in self._db.docs:
            raise AssertionError(f"update() on missing document {ref.path}")
        self.writes.append(("update", ref.path, copy.deepcopy(data)))
        doc = self._db.docs[ref.path]
        for key, value in data.items():
            _set_dotted(doc, key, copy.deepcopy(value))
