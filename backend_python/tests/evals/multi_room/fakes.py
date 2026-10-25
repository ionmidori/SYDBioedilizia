"""In-memory backend for the multi-room eval (Phase 138).

The live model drives the real room tools, the real `generate_render` tool and
the real `suggest_quote_items` (with the live InsightEngine), but rooms, project
files, the chat history, the image backend and the quote store are fakes: the
run writes nothing to Firestore or Storage, spends no render quota, and records
which photo every render started from and every quote it would have saved. The
project matches the eval cases: a kitchen and a bathroom, photos uploaded
kitchen → bathroom → kitchen.
"""
import uuid
from collections.abc import Callable, Iterator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from src.core.exceptions import ProjectFileNotFoundError, RoomNotFoundError
from src.schemas.quote import QuoteRequest, QuoteSchema
from src.schemas.room import DEFAULT_ROOM_ID, RoomCreate, RoomSchema
from src.services.quote_drafts import DraftSaveOutcome, DraftSaveResult
from src.services.room_aggregation import load_rules
from src.tools.quota import QuotaDecision
from src.utils.datetime_utils import utc_now

KITCHEN_ROOM_ID = "r_cucina"
BATH_ROOM_ID = "r_bagno"
KITCHEN_PHOTOS = ("f_cucina_1", "f_cucina_2")
BATH_PHOTO = "f_bagno_1"


def photo_url(file_id: str) -> str:
    return f"https://storage.example.invalid/user-uploads/eval/{file_id}.jpg"


def _room(room_id: str, label: str, room_type: str) -> RoomSchema:
    now = utc_now()
    return RoomSchema(room_id=room_id, label=label, room_type=room_type, created_at=now, updated_at=now)


@dataclass
class FakeRoomRepository:
    """`RoomRepository` over dicts; ignores the project id (one eval project)."""

    rooms: dict[str, RoomSchema] = field(default_factory=lambda: {
        KITCHEN_ROOM_ID: _room(KITCHEN_ROOM_ID, "Cucina", "cucina"),
        BATH_ROOM_ID: _room(BATH_ROOM_ID, "Bagno", "bagno"),
    })
    # Oldest first: kitchen, bathroom, kitchen again.
    files: list[dict[str, Any]] = field(default_factory=lambda: [
        {"id": KITCHEN_PHOTOS[0], "type": "image", "url": photo_url(KITCHEN_PHOTOS[0]), "roomId": KITCHEN_ROOM_ID},
        {"id": BATH_PHOTO, "type": "image", "url": photo_url(BATH_PHOTO), "roomId": BATH_ROOM_ID},
        {"id": KITCHEN_PHOTOS[1], "type": "image", "url": photo_url(KITCHEN_PHOTOS[1]), "roomId": KITCHEN_ROOM_ID},
    ])

    async def list_rooms(self, project_id: str) -> list[RoomSchema]:
        return list(self.rooms.values())

    async def get_room(self, project_id: str, room_id: str) -> RoomSchema | None:
        return self.rooms.get(room_id)

    async def require_room(self, project_id: str, room_id: str) -> RoomSchema:
        if room_id not in self.rooms:
            raise RoomNotFoundError(project_id, room_id)
        return self.rooms[room_id]

    async def create_room(self, project_id: str, data: RoomCreate) -> RoomSchema:
        room = _room(f"r_{uuid.uuid4().hex[:8]}", data.label, data.room_type)
        self.rooms[room.room_id] = room
        return room

    async def files_for_room(
        self, project_id: str, room_id: str, *, file_type: str | None = None, limit: int | None = None
    ) -> list[dict[str, Any]]:
        found = [
            f for f in reversed(self.files)
            if f.get("roomId") == room_id and (file_type is None or f["type"] == file_type)
        ]
        return found[:limit] if limit is not None else found

    async def latest_room_photo(self, project_id: str, room_id: str) -> dict[str, Any] | None:
        photos = await self.files_for_room(project_id, room_id, file_type="image", limit=1)
        return photos[0] if photos else None

    async def latest_unclassified_photo(self, project_id: str) -> dict[str, Any] | None:
        return next(
            (f for f in reversed(self.files) if f["type"] == "image" and f.get("roomId") in (None, "generale")),
            None,
        )

    async def list_files(self, project_id: str) -> list[dict[str, Any]]:
        return list(self.files)

    async def find_file_by_storage_path(self, project_id: str, storage_path: str) -> dict[str, Any] | None:
        return None

    async def assign_file_to_room(self, project_id: str, file_id: str, room_id: str) -> None:
        await self.require_room(project_id, room_id)
        doc = next((f for f in self.files if f["id"] == file_id), None)
        if doc is None:
            raise ProjectFileNotFoundError(project_id, file_id)
        doc["roomId"] = room_id


@dataclass
class RenderRecorder:
    """Photo each `generate_render` call started from (None = text to image)."""

    sources: list[str | None] = field(default_factory=list)

    async def render(self, **kwargs: Any) -> dict[str, Any]:
        self.sources.append(kwargs.get("source_image_url"))
        return {"status": "success", "imageUrl": "https://storage.example.invalid/renders/eval/render.png"}

    def problems(self) -> list[str]:
        """Why the run broke the rule "a bathroom render starts from the bathroom photo"."""
        if not self.sources:
            return ["no render was generated"]
        expected = photo_url(BATH_PHOTO)
        return [f"render {i + 1} started from {s!r}, expected {expected!r}" for i, s in enumerate(self.sources) if s != expected]


# The quote case's conversation as Firestore would hold it: each message tagged
# with the room active when it was sent (untagged = project-wide talk).
QUOTE_HISTORY: list[dict[str, Any]] = [
    {"role": "user", "content": "Ciao! Ristrutturiamo bagno e cucina, appartamento a Roma al terzo piano con ascensore."},
    {"role": "assistant", "content": "Perfetto, partiamo dal bagno."},
    {"role": "user", "room_id": BATH_ROOM_ID, "content": (
        "Il bagno è 2 x 2,5 m, altezza 2,70. Voglio rifare tutto: togliere la vasca e i sanitari, piastrelle "
        "nuove a pavimento (5 mq) e alle pareti fino a 2,10 m (circa 19 mq), doccia walk-in con piatto a filo "
        "pavimento, impermeabilizzazione della zona doccia e sanitari sospesi nuovi.")},
    {"role": "assistant", "room_id": BATH_ROOM_ID, "content": "Bagno chiaro: demolizione, rivestimenti, doccia e sanitari."},
    {"role": "user", "room_id": KITCHEN_ROOM_ID, "content": (
        "Passiamo alla cucina: 3 x 4 m. Tengo i mobili, ma voglio un top in quarzo di 3,5 metri lineari, "
        "la presa dedicata per il piano a induzione e il gres nuovo a pavimento (12 mq), "
        "togliendo il pavimento vecchio.")},
    {"role": "assistant", "room_id": KITCHEN_ROOM_ID, "content": "Cucina chiara: top, presa induzione e pavimento."},
    {"role": "user", "content": (
        "Per entrambe le stanze serve anche lo smaltimento delle macerie e la protezione dei pavimenti "
        "del resto della casa. Registra adesso la richiesta di preventivo per bagno e cucina.")},
]

# Lines that can only belong to one room.
_BATH_ONLY = ("BAG-", "DEM-006", "DEM-007", "IMP-ID-002", "IMP-ID-003")
_KITCHEN_ONLY = ("CUC-", "DEM-008")


class FakeConversations:
    """`ConversationRepository.get_context` over QUOTE_HISTORY."""

    async def get_context(self, session_id: str, limit: int = 10, room_id: str | None = None) -> list[dict[str, Any]]:
        messages = [m for m in QUOTE_HISTORY if room_id is None or m.get("room_id") == room_id]
        return messages[-limit:]


@dataclass
class QuoteRecorder:
    """Every quote `suggest_quote_items` would have saved (instead of Firestore)."""

    quotes: list[QuoteSchema] = field(default_factory=list)

    async def save(self, db: Any, project_id: str, quote: QuoteSchema, request: QuoteRequest, **_: Any) -> DraftSaveResult:
        self.quotes.append(quote)
        return DraftSaveResult(DraftSaveOutcome.CREATED, "draft", "PRV-EVAL-0001")

    def problems(self) -> list[str]:
        """Why the last quote is not one quote with a correct section per room."""
        if not self.quotes:
            return ["no quote was saved"]
        quote = self.quotes[-1]
        sections = [r.room_id for r in quote.rooms]
        found = [f"no section for {rid}" for rid in (BATH_ROOM_ID, KITCHEN_ROOM_ID) if rid not in sections]
        project_wide = load_rules().project_wide_skus
        for item in quote.items:
            if item.sku.startswith(_BATH_ONLY) and item.room_id != BATH_ROOM_ID:
                found.append(f"bathroom line {item.sku} in {item.room_id}")
            if item.sku.startswith(_KITCHEN_ONLY) and item.room_id != KITCHEN_ROOM_ID:
                found.append(f"kitchen line {item.sku} in {item.room_id}")
            if item.sku in project_wide and item.room_id != DEFAULT_ROOM_ID:
                found.append(f"project-wide line {item.sku} in {item.room_id}")
        if not any(i.room_id == DEFAULT_ROOM_ID for i in quote.items):
            found.append("no common line (disposal, protection) in Generale")
        return found


@dataclass
class MultiRoomRun:
    renders: RenderRecorder
    quotes: QuoteRecorder


# What each multi-room eval set checks in the backend after its run (run_evals.py).
BACKEND_CHECKS: dict[str, Callable[[MultiRoomRun], list[str]]] = {
    "multi_room_flow.test.json": lambda run: run.renders.problems(),
    "multi_room_quote.test.json": lambda run: run.quotes.problems(),
}


@contextmanager
def multi_room_backend() -> Iterator[MultiRoomRun]:
    """Patch the room repository, chat history, login/quota gates, the image
    backend and the quote store (no Firestore or Storage write)."""
    repo = FakeRoomRepository()
    run = MultiRoomRun(renders=RenderRecorder(), quotes=QuoteRecorder())
    newest_project_photo = photo_url(KITCHEN_PHOTOS[1])  # what a room-blind render would use
    allowed = QuotaDecision(True, 10, utc_now())
    not_sent = AsyncMock(return_value="Invio non disponibile durante la valutazione.")
    with ExitStack() as stack:
        for target in (
            "src.tools.room_tools.get_room_repository",
            "src.adk.tools.get_room_repository",
            "src.tools.quote_tools.get_room_repository",
        ):
            stack.enter_context(patch(target, return_value=repo))
        stack.enter_context(patch("src.adk.tools.latest_uploaded_photo_url", new=AsyncMock(return_value=newest_project_photo)))
        stack.enter_context(patch("src.adk.tools.is_anonymous_user", new=AsyncMock(return_value=False)))
        stack.enter_context(patch("src.adk.tools.check_quota", new=AsyncMock(return_value=allowed)))
        stack.enter_context(patch("src.adk.tools.increment_quota", new=AsyncMock()))
        stack.enter_context(patch("src.tools.generate_render.generate_render_wrapper", new=run.renders.render))
        # Quote: history and store in memory, seed price book (no Firestore read either).
        stack.enter_context(patch("src.tools.quote_tools.ConversationRepository", return_value=FakeConversations()))
        stack.enter_context(patch("src.tools.quote_tools.save_ai_draft", new=run.quotes.save))
        stack.enter_context(patch("src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=None)))
        stack.enter_context(patch("src.tools.quote_tools.get_async_firestore_client", new=MagicMock()))
        stack.enter_context(patch("src.services.pricing_service.PricingService.ensure_fresh", new=AsyncMock()))
        # Never send a request to the team or write the phone number from an eval.
        stack.enter_context(patch("src.tools.batch_tools.list_ready_quotes_wrapper", new=not_sent))
        stack.enter_context(patch("src.tools.batch_tools.submit_quote_request_wrapper", new=not_sent))
        stack.enter_context(patch("src.db.firebase_client.get_async_firestore_client", new=MagicMock()))
        yield run
