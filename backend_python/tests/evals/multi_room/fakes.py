"""In-memory backend for the multi-room eval (Phase 138).

The live model drives the real room tools, the real `generate_render` tool and
the real `suggest_quote_items` (with the live InsightEngine), but rooms, project
files, the chat history, the image backend and the quote store are fakes: the
run writes nothing to Firestore or Storage, spends no render quota, never sends
a request to the team, and records which photo every render started from, every
quote it would have saved and every submission it would have made. The
project matches the eval cases: a kitchen and a bathroom, photos uploaded
kitchen → bathroom → kitchen.

The long-chat set also records the final reply of every turn (`ResponseRecorder`,
a plugin of the eval App) and every history compaction, to check that facts
given before the compaction still come back for the right room.

Phase 138 PR-6: every set also records the tools called in each turn
(`ToolCallRecorder`), so the guest sets can count the login requests per turn;
in those sets the premium tools' login gate answers "guest". Each set reads its
own chat history in `suggest_quote_items` (`QUOTE_HISTORIES`).
"""
import re
import uuid
from collections.abc import Callable, Iterator
from contextlib import ExitStack, contextmanager
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

from google.adk.agents.callback_context import CallbackContext
from google.adk.agents.invocation_context import InvocationContext
from google.adk.apps.llm_event_summarizer import LlmEventSummarizer
from google.adk.events import Event
from google.adk.models.llm_response import LlmResponse
from google.adk.plugins.base_plugin import BasePlugin
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext
from google.genai import types
from src.core.exceptions import ProjectFileNotFoundError, RoomNotFoundError
from src.core.money import sum_amounts
from src.schemas.quote import QuoteRequest, QuoteSchema
from src.schemas.room import DEFAULT_ROOM_ID, RoomCreate, RoomSchema
from src.services.pricing_service import PricingService
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


# Phase 138 PR-6: the same home, plus a corridor the user mentions but never
# creates as a room (untagged talk): it belongs to "Generale", once.
CORRIDOR_MESSAGE = (
    "Rifate anche il corridoio: circa 8 mq, togliamo la moquette e mettiamo il parquet. "
    "Registra adesso la richiesta di preventivo per tutta la casa."
)
GENERAL_HISTORY: list[dict[str, Any]] = [
    *QUOTE_HISTORY[:-1],
    {"role": "user", "content": (
        "Per entrambe le stanze serve anche lo smaltimento delle macerie e la protezione dei pavimenti "
        "del resto della casa.")},
    {"role": "assistant", "content": "Annotato: smaltimento e protezioni."},
    {"role": "user", "content": CORRIDOR_MESSAGE},
]

# A guest's (then registered user's) bathroom quote: a chat without rooms.
BATH_ONLY_HISTORY: list[dict[str, Any]] = [
    {"role": "user", "content": "Ciao, vorrei un preventivo per rifare il bagno."},
    {"role": "assistant", "content": "Certo! Mi descrivi il bagno e i lavori che hai in mente?"},
    {"role": "user", "content": (
        "È 2 x 2,5 m, altezza 2,70, appartamento a Roma al terzo piano con ascensore. Voglio togliere la "
        "vasca e i sanitari, piastrelle nuove a pavimento (5 mq) e alle pareti fino a 2,10 m (circa 19 mq), "
        "doccia walk-in con piatto a filo pavimento e sanitari sospesi nuovi.")},
    {"role": "assistant", "content": "Ho tutto quello che mi serve. Preparo la richiesta di preventivo?"},
    {"role": "user", "content": "Sì, prepara pure la richiesta di preventivo."},
]


@dataclass
class FakeConversations:
    """`ConversationRepository.get_context` over a fixed chat history."""

    history: list[dict[str, Any]] = field(default_factory=lambda: QUOTE_HISTORY)

    async def get_context(self, session_id: str, limit: int = 10, room_id: str | None = None) -> list[dict[str, Any]]:
        messages = [m for m in self.history if room_id is None or m.get("room_id") == room_id]
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

    def general_problems(self) -> list[str]:
        """Phase 138 PR-6: why the corridor (never a room) is not quoted once, in
        Generale, or the sections do not add up (money.py)."""
        found = self.problems()
        if not self.quotes:
            return found
        quote = self.quotes[-1]
        corridor = [i for i in quote.items if "corridoio" in (i.ai_reasoning or "").lower()]
        if not corridor:
            found.append("no line for the corridor")
        found += [f"corridor line {i.sku} in {i.room_id}" for i in corridor if i.room_id != DEFAULT_ROOM_ID]
        if sum_amounts(s.room_subtotal for s in quote.rooms) != quote.financials.subtotal:
            found.append("section subtotals do not add up to the subtotal")
        if quote.financials != PricingService.calculate_financials(quote.items):
            found.append("totals differ from money.py on the quote lines")
        return found


@dataclass
class SubmitRecorder:
    """Every `submit_quote_request` call (instead of sending it to the team),
    with how many quotes were saved before it."""

    quotes: QuoteRecorder
    after_quotes: list[int] = field(default_factory=list)

    async def submit(self, **_: Any) -> str:
        self.after_quotes.append(len(self.quotes.quotes))
        return "✅ Richiesta di preventivo inviata (riferimento PRV-EVAL-0001). Il nostro team è stato avvisato."

    def problems(self, expected: int) -> list[str]:
        """Why the run broke "send only after the client's explicit yes, once"."""
        if len(self.after_quotes) != expected:
            return [f"submit_quote_request called {len(self.after_quotes)} times, expected {expected}"]
        return [f"submission {i + 1} before any saved quote" for i, n in enumerate(self.after_quotes) if n == 0]


class ResponseRecorder(BasePlugin):
    """Visible text and token usage of every complete model response, per
    invocation (turn), in order."""

    def __init__(self) -> None:
        super().__init__(name="eval_response_recorder")
        self.texts: dict[str, list[str]] = {}
        # invocation → [(agent, prompt tokens, cached tokens)], one per model call
        self.usage: dict[str, list[tuple[str, int, int]]] = {}

    def reset(self) -> None:
        self.texts = {}
        self.usage = {}

    async def after_model_callback(
        self, *, callback_context: CallbackContext, llm_response: LlmResponse
    ) -> LlmResponse | None:
        if llm_response.partial is True:
            return None
        usage = llm_response.usage_metadata
        if usage is not None and usage.prompt_token_count:
            self.usage.setdefault(callback_context.invocation_id, []).append(
                (callback_context.agent_name, usage.prompt_token_count, usage.cached_content_token_count or 0)
            )
        if not llm_response.content:
            return None
        text = "".join(p.text for p in llm_response.content.parts or [] if p.text and not p.thought)
        if text.strip():
            self.texts.setdefault(callback_context.invocation_id, []).append(text)
        return None

    def turns(self) -> list[str]:
        """Last reply of each turn, in turn order."""
        return [replies[-1] for replies in self.texts.values()]

    def token_report(self) -> list[str]:
        """One line per turn: prompt and cached tokens of each model call."""
        return [
            f"turn {i}: " + ", ".join(f"{agent} prompt={prompt} cached={cached}" for agent, prompt, cached in calls)
            for i, calls in enumerate(self.usage.values(), 1)
        ]


# Shared with the eval App (tests/evals/multi_room/agent.py); reset for every run.
RESPONSES = ResponseRecorder()


class ToolCallRecorder(BasePlugin):
    """Tools called in every turn (invocation), in order: every turn is listed,
    also one without tool calls."""

    def __init__(self) -> None:
        super().__init__(name="eval_tool_call_recorder")
        self.calls: dict[str, list[tuple[str, str]]] = {}  # invocation → [(agent, tool)]

    def reset(self) -> None:
        self.calls = {}

    async def before_run_callback(self, *, invocation_context: InvocationContext) -> types.Content | None:
        self.calls.setdefault(invocation_context.invocation_id, [])
        return None

    async def before_tool_callback(
        self, *, tool: BaseTool, tool_args: dict[str, Any], tool_context: ToolContext
    ) -> dict[str, Any] | None:
        self.calls.setdefault(tool_context.invocation_id, []).append((tool_context.agent_name, tool.name))
        return None

    def turns(self) -> list[list[tuple[str, str]]]:
        return list(self.calls.values())

    def report(self) -> list[str]:
        """One line per turn: agent.tool of each call."""
        return [
            f"turn {i}: " + (", ".join(f"{agent}.{tool}" for agent, tool in calls) or "-")
            for i, calls in enumerate(self.turns(), 1)
        ]


TOOL_CALLS = ToolCallRecorder()


@dataclass
class CompactionRecorder:
    """Summaries the history compaction produced (None: the summarizer gave up)."""

    summaries: list[str | None] = field(default_factory=list)

    def wrap(self, original: Callable[..., Any]) -> Callable[..., Any]:
        async def summarize(summarizer: LlmEventSummarizer, *, events: list[Event]) -> Event | None:
            event = await original(summarizer, events=events)
            compaction = event.actions.compaction if event is not None and event.actions else None
            content = compaction.compacted_content if compaction is not None else None
            self.summaries.append("".join(p.text or "" for p in content.parts or []) if content else None)
            return event
        return summarize


# Long chat: (turn counted from the end, what the reply must mention, why).
_RECALL: tuple[tuple[int, str, str], ...] = (
    (-3, r"\b5\s*(mq|m²|m2|metri quadr)", "bathroom floor 5 mq"),
    (-3, r"rovere", "kitchen oak-effect tiles"),
    (-2, r"\b8\s*(mq|m²|m2|metri quadr)", "corridor 8 mq"),
    (-2, r"parquet", "corridor parquet"),
    (-1, r"f_bagno_1", "bathroom photo id"),
    (-1, r"umidit", "bathroom damp stain"),
)


def _long_chat_problems(run: "MultiRoomRun") -> list[str]:
    """Why the long chat lost a fact of the right room, or was never compacted."""
    found = [] if any(run.compactions.summaries) else ["the history was never compacted"]
    turns = run.responses.turns()
    if len(turns) < 3:
        return [*found, f"only {len(turns)} turns answered"]
    for position, pattern, fact in _RECALL:
        if not re.search(pattern, turns[position], re.IGNORECASE):
            found.append(f"turn {len(turns) + position + 1} misses the {fact}: {turns[position][:160]!r}")
    return found


@dataclass
class MultiRoomRun:
    renders: RenderRecorder
    quotes: QuoteRecorder
    submissions: SubmitRecorder
    responses: ResponseRecorder = field(default_factory=lambda: RESPONSES)
    compactions: CompactionRecorder = field(default_factory=CompactionRecorder)
    tool_calls: ToolCallRecorder = field(default_factory=lambda: TOOL_CALLS)


LOGIN_TOOL = "request_login"
# Refused to a guest server side (src/adk/tools.py): a guest's turn must never call them.
PREMIUM_TOOLS = frozenset({
    "generate_render", "suggest_quote_items", "submit_quote_request", "pricing_engine_tool",
    "search_prezzario", "retrieve_price_by_code", "get_market_prices",
})


def _login_problems(run: MultiRoomRun, *, login_turn: int | None) -> list[str]:
    """Phase 138 PR-6, a guest: no login card before the confirmation, exactly
    one in the turn of the confirmation (`login_turn`, counted from the end;
    None: no turn confirms), no premium tool in any turn."""
    turns = run.tool_calls.turns()
    if not turns:
        return ["no turn was recorded"]
    confirm = len(turns) + login_turn if login_turn is not None else None
    found: list[str] = []
    for n, calls in enumerate(turns):
        logins = sum(tool == LOGIN_TOOL for _, tool in calls)
        expected = 1 if n == confirm else 0
        if logins != expected:
            found.append(f"turn {n + 1}: {logins} login requests, expected {expected}")
        found += [f"turn {n + 1}: guest called {agent}.{tool}" for agent, tool in calls if tool in PREMIUM_TOOLS]
    return found


def _logged_in_problems(run: MultiRoomRun) -> list[str]:
    """A registered user is never asked to log in, and gets the quote."""
    logins = [n + 1 for n, calls in enumerate(run.tool_calls.turns()) if any(t == LOGIN_TOOL for _, t in calls)]
    found = [f"login requested in turn {n}" for n in logins]
    return found + ([] if run.quotes.quotes else ["no quote was saved"])


# What each multi-room eval set checks in the backend after its run (run_evals.py).
BACKEND_CHECKS: dict[str, Callable[[MultiRoomRun], list[str]]] = {
    "multi_room_flow.test.json": lambda run: run.renders.problems(),
    # "Registra la richiesta" saves the quote and sends nothing: sending needs an explicit yes.
    "multi_room_quote.test.json": lambda run: run.quotes.problems() + run.submissions.problems(expected=0),
    "multi_room_submit.test.json": lambda run: run.quotes.problems() + run.submissions.problems(expected=1),
    # Facts given before the compaction come back for the right room.
    "multi_room_long_chat.test.json": _long_chat_problems,
    # A corridor never created as a room: quoted once, in Generale.
    "multi_room_general.test.json": lambda run: run.quotes.general_problems() + run.submissions.problems(expected=0),
    # A guest is asked to log in once, in the turn it confirms, and never reaches a premium tool.
    "guest_quote.test.json": lambda run: _login_problems(run, login_turn=-1),
    "guest_render.test.json": lambda run: _login_problems(run, login_turn=-1),
    # A price question is not a confirmation: the listino range, no login.
    "guest_price.test.json": lambda run: _login_problems(run, login_turn=None),
    "logged_in_quote.test.json": _logged_in_problems,
}

# Sets whose user is a guest (the login gate of the premium tools answers "guest").
GUEST_SETS = frozenset({"guest_quote.test.json", "guest_render.test.json", "guest_price.test.json"})
# Chat history suggest_quote_items reads, per set (default: QUOTE_HISTORY).
QUOTE_HISTORIES: dict[str, list[dict[str, Any]]] = {
    "multi_room_general.test.json": GENERAL_HISTORY,
    "logged_in_quote.test.json": BATH_ONLY_HISTORY,
}


@contextmanager
def multi_room_backend(set_name: str = "") -> Iterator[MultiRoomRun]:
    """Patch the room repository, chat history, login/quota gates, the image
    backend and the quote store (no Firestore or Storage write), for the eval
    set `set_name` (its user, guest or registered, and its chat history)."""
    repo = FakeRoomRepository()
    quotes = QuoteRecorder()
    run = MultiRoomRun(renders=RenderRecorder(), quotes=quotes, submissions=SubmitRecorder(quotes))
    RESPONSES.reset()
    TOOL_CALLS.reset()
    guest = set_name in GUEST_SETS
    conversations = FakeConversations(QUOTE_HISTORIES.get(set_name, QUOTE_HISTORY))
    newest_project_photo = photo_url(KITCHEN_PHOTOS[1])  # what a room-blind render would use
    allowed = QuotaDecision(True, 10, utc_now())
    with ExitStack() as stack:
        for target in (
            "src.tools.room_tools.get_room_repository",
            "src.adk.tools.get_room_repository",
            "src.tools.quote_tools.get_room_repository",
        ):
            stack.enter_context(patch(target, return_value=repo))
        stack.enter_context(patch("src.adk.tools.latest_uploaded_photo_url", new=AsyncMock(return_value=newest_project_photo)))
        # The gate itself (not only the account lookup): the dev auth bypass of a local .env would open it.
        stack.enter_context(patch("src.adk.tools._is_guest", new=AsyncMock(return_value=guest)))
        stack.enter_context(patch("src.adk.tools.check_quota", new=AsyncMock(return_value=allowed)))
        stack.enter_context(patch("src.adk.tools.increment_quota", new=AsyncMock()))
        stack.enter_context(patch("src.tools.generate_render.generate_render_wrapper", new=run.renders.render))
        # Quote: history and store in memory, seed price book (no Firestore read either).
        stack.enter_context(patch("src.tools.quote_tools.ConversationRepository", return_value=conversations))
        stack.enter_context(patch("src.tools.quote_tools.save_ai_draft", new=run.quotes.save))
        stack.enter_context(patch("src.tools.quote_tools.gather_dossier_inputs", new=AsyncMock(return_value=None)))
        stack.enter_context(patch("src.tools.quote_tools.get_async_firestore_client", new=MagicMock()))
        stack.enter_context(patch("src.services.pricing_service.PricingService.ensure_fresh", new=AsyncMock()))
        # Never send a request to the team or write the phone number from an eval.
        stack.enter_context(patch("src.adk.tools.submit_quote_request_wrapper", new=run.submissions.submit))
        stack.enter_context(patch("src.db.firebase_client.get_async_firestore_client", new=MagicMock()))
        stack.enter_context(patch.object(
            LlmEventSummarizer, "maybe_summarize_events",
            new=run.compactions.wrap(LlmEventSummarizer.maybe_summarize_events),
        ))
        yield run
