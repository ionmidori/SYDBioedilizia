"""Minimal in-memory Firestore doubles for transaction-body unit tests.

Only what the quote domain code uses: collection/document paths, `get` with a
transaction, and `set` / `update` (dotted field paths) on a transaction.
Writes are applied on commit-like `apply()`; the fake also enforces the real
rule that a transaction may not read after it has written.
"""
from __future__ import annotations

import copy
from typing import Any


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

    async def get(self, transaction: FakeTransaction | None = None) -> FakeSnapshot:
        if transaction is not None:
            transaction.record_read(self.path)
        return FakeSnapshot(self._db.docs.get(self.path))


class FakeCollection:
    def __init__(self, db: FakeDb, path: tuple[str, ...]) -> None:
        self._db = db
        self.path = path

    def document(self, doc_id: str) -> FakeDocRef:
        return FakeDocRef(self._db, (*self.path, doc_id))


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


def _set_dotted(target: dict[str, Any], dotted: str, value: Any) -> None:
    *parents, leaf = dotted.split(".")
    node = target
    for key in parents:
        node = node.setdefault(key, {})
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
