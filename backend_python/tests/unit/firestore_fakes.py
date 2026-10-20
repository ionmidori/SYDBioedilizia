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
    def __init__(self, data: dict[str, Any] | None, doc_id: str = "") -> None:
        self._data = copy.deepcopy(data)
        self.exists = data is not None
        self.id = doc_id

    def to_dict(self) -> dict[str, Any] | None:
        return copy.deepcopy(self._data)


class FakeDocRef:
    def __init__(self, db: FakeDb, path: tuple[str, ...]) -> None:
        self._db = db
        self.path = path

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self._db, (*self.path, name))

    async def collections(self):
        """Subcollections holding at least one document — found even when this
        document itself does not exist (Firestore keeps orphaned subcollections)."""
        depth = len(self.path)
        names = sorted({p[depth] for p in self._db.docs if len(p) > depth + 1 and p[:depth] == self.path})
        for name in names:
            yield self.collection(name)

    @property
    def reference(self) -> FakeDocRef:
        return self

    @property
    def parent(self) -> FakeCollection:
        return FakeCollection(self._db, self.path[:-1])

    @property
    def id(self) -> str:
        return self.path[-1]

    async def get(self, transaction: FakeTransaction | None = None) -> FakeSnapshot:
        if transaction is not None:
            transaction.record_read(self.path)
        return FakeSnapshot(self._db.docs.get(self.path), self.path[-1])

    async def update(self, data: dict[str, Any]) -> None:
        self._db.apply_update(self.path, data)

    async def delete(self) -> None:
        self._db.docs.pop(self.path, None)

    async def set(self, data: dict[str, Any], merge: bool = False) -> None:
        self._db.apply_set(self.path, data, merge=merge)


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

    def document(self, doc_id: str | None = None) -> FakeDocRef:
        if doc_id is None:  # auto-id, like Firestore's collection.document()
            self._db.auto_ids += 1
            doc_id = f"auto{self._db.auto_ids:04d}"
        return FakeDocRef(self._db, (*self.path, doc_id))

    _order: tuple[str, bool] | None = None
    _limit: int | None = None
    _filters: tuple[tuple[str, str, Any], ...] = ()
    _group: str | None = None  # collection-group query: every collection with this name

    @property
    def parent(self) -> FakeDocRef | None:
        return FakeDocRef(self._db, self.path[:-1]) if len(self.path) > 1 else None

    @property
    def id(self) -> str:
        return self.path[-1]

    async def list_documents(self):
        """References of every document id in this collection, including "missing"
        documents that only have subcollections (like Firestore's list_documents)."""
        depth = len(self.path)
        ids = sorted({p[depth] for p in self._db.docs if len(p) > depth and p[:depth] == self.path})
        for doc_id in ids:
            yield self.document(doc_id)

    async def add(self, data: dict[str, Any]) -> tuple[None, FakeDocRef]:
        ref = self.document()
        self._db.docs[ref.path] = copy.deepcopy(data)
        return None, ref

    def count(self, alias: str = "count") -> _FakeAggregation:
        return _FakeAggregation(self)

    def where(self, *args: Any, filter: Any = None) -> FakeCollection:
        clone = FakeCollection(self._db, self.path)
        clone._order, clone._limit, clone._group = self._order, self._limit, self._group
        condition = (filter.field_path, filter.op_string, filter.value) if filter is not None else tuple(args)
        clone._filters = (*self._filters, condition)
        return clone

    def _matches(self, data: dict[str, Any]) -> bool:
        for field, op, value in self._filters:
            # Like Firestore: a document WITHOUT the field never matches a filter
            # on it — not even `== None` (which matches only an explicit null).
            # Dotted paths reach into maps ("metadata.email").
            node: Any = data
            for part in field.split("."):
                if not isinstance(node, dict) or part not in node:
                    return False
                node = node[part]
            actual = node
            if op == "==":
                if actual != value:
                    return False
            elif op == "<=":
                if actual is None or actual > value:
                    return False
            elif op == ">=":
                if actual is None or actual < value:
                    return False
            elif op == "in":
                if actual not in value:
                    return False
            else:
                # Never silently match everything on an operator the fake lacks.
                raise NotImplementedError(f"FakeCollection.where: operator {op!r} not supported")
        return True

    def select(self, _fields: list[str]) -> FakeCollection:
        return self  # projection only trims the wire payload; the fake returns whole documents

    def limit(self, n: int) -> FakeCollection:
        self._limit = n
        return self

    def order_by(self, field: str, direction: str = "ASCENDING") -> FakeCollection:
        self._order = (field, str(direction).upper().startswith("DESC"))
        return self

    def _paths(self) -> list[tuple[str, ...]]:
        if self._group:
            return [
                p for p in sorted(self._db.docs)
                if len(p) >= 2 and p[-2] == self._group and self._matches(self._db.docs[p])
            ]
        depth = len(self.path) + 1
        return [
            p
            for p in sorted(self._db.docs)
            if len(p) == depth and p[: len(self.path)] == self.path and self._matches(self._db.docs[p])
        ]

    async def stream(self):
        paths = self._paths()
        if self._order:
            field, desc = self._order
            paths.sort(key=lambda p: self._db.docs[p].get(field), reverse=desc)
        for path in paths[: self._limit] if self._limit is not None else paths:
            yield FakeDocSnapshot(self._db, path)

    async def get(self) -> list[FakeDocSnapshot]:
        return [snap async for snap in self.stream()]


class _FakeCount:
    def __init__(self, value: int) -> None:
        self.value = value


class _FakeAggregation:
    def __init__(self, query: FakeCollection) -> None:
        self._query = query

    async def get(self) -> list[list[_FakeCount]]:
        return [[_FakeCount(len(self._query._paths()))]]


class FakeDb:
    def __init__(self) -> None:
        self.docs: dict[tuple[str, ...], dict[str, Any]] = {}
        self.auto_ids = 0
        self.batches = 0  # write batches opened (chunking assertions)

    def collection(self, name: str) -> FakeCollection:
        return FakeCollection(self, (name,))

    def collection_group(self, name: str) -> FakeCollection:
        group = FakeCollection(self, ())
        group._group = name
        return group

    def put(self, *path_and_data: Any) -> None:
        *path, data = path_and_data
        self.docs[tuple(path)] = copy.deepcopy(data)

    def get_data(self, *path: str) -> dict[str, Any] | None:
        return copy.deepcopy(self.docs.get(tuple(path)))

    def batch(self) -> FakeBatch:
        self.batches += 1
        return FakeBatch(self)

    def apply_set(self, path: tuple[str, ...], data: dict[str, Any], *, merge: bool) -> None:
        if merge:
            # Merge creates a missing document; DELETE_FIELD on an absent field is a no-op.
            target = self.docs.setdefault(path, {})
            for key, value in data.items():
                _set_dotted(target, key, copy.deepcopy(value))
        else:
            # A plain set() cannot carry DELETE_FIELD (the real client rejects it).
            if any(isinstance(v, type(DELETE_FIELD)) for v in data.values()):
                raise AssertionError(f"DELETE_FIELD in a non-merge set() on {path}")
            self.docs[path] = copy.deepcopy(data)

    def apply_update(self, path: tuple[str, ...], data: dict[str, Any]) -> None:
        if path not in self.docs:
            raise AssertionError(f"update() on missing document {path}")
        for key, value in data.items():
            _set_dotted(self.docs[path], key, copy.deepcopy(value))


class FakeBatch:
    """Queues writes and applies them on commit(), like a Firestore WriteBatch."""

    MAX_WRITES = 500  # Firestore's per-batch limit

    def __init__(self, db: FakeDb) -> None:
        self._db = db
        self._ops: list[tuple[str, tuple[str, ...], dict[str, Any], bool]] = []

    def _queue(self, op: str, ref: FakeDocRef, data: dict[str, Any], merge: bool = False) -> None:
        self._ops.append((op, ref.path, copy.deepcopy(data), merge))
        if len(self._ops) > self.MAX_WRITES:
            raise AssertionError(f"batch exceeds {self.MAX_WRITES} writes")

    def delete(self, ref: FakeDocRef) -> None:
        self._queue("delete", ref, {})

    def update(self, ref: FakeDocRef, data: dict[str, Any]) -> None:
        self._queue("update", ref, data)

    def set(self, ref: FakeDocRef, data: dict[str, Any], merge: bool = False) -> None:
        self._queue("set", ref, data, merge)

    async def commit(self) -> None:
        for op, path, data, merge in self._ops:
            if op == "delete":
                self._db.docs.pop(path, None)
            elif op == "update":
                self._db.apply_update(path, data)
            else:
                self._db.apply_set(path, data, merge=merge)


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

    def delete(self, ref: FakeDocRef) -> None:
        self.writes.append(("delete", ref.path, {}))
        self._db.docs.pop(ref.path, None)

    def update(self, ref: FakeDocRef, data: dict[str, Any]) -> None:
        if ref.path not in self._db.docs:
            raise AssertionError(f"update() on missing document {ref.path}")
        self.writes.append(("update", ref.path, copy.deepcopy(data)))
        doc = self._db.docs[ref.path]
        for key, value in data.items():
            _set_dotted(doc, key, copy.deepcopy(value))


class FakeBlob:
    def __init__(self, name: str) -> None:
        self.name = name


class FakeBucket:
    """Storage bucket double: `list_blobs(prefix=)` / `delete_blobs()`.

    `fail_on` makes listing a prefix starting with that string raise, to test
    fail-closed paths.
    """

    def __init__(self, names: list[str] | None = None, fail_on: str | None = None) -> None:
        self.names: set[str] = set(names or [])
        self.fail_on = fail_on

    def list_blobs(self, prefix: str = "") -> list[FakeBlob]:
        if self.fail_on is not None and prefix.startswith(self.fail_on):
            raise RuntimeError(f"storage unavailable for {prefix}")
        return [FakeBlob(n) for n in sorted(self.names) if n.startswith(prefix)]

    def delete_blobs(self, blobs: list[FakeBlob]) -> None:
        for blob in blobs:
            self.names.discard(blob.name)
