"""A broken attached video costs the user that video, never the whole reply.

- Videos skipped before the model call → a `data-notice` for the user and a note
  for the model (so it does not describe a video it never saw).
- The model refusing a video at runtime → one retry without the videos, the URIs
  recorded in the ADK session state (VideoGuardPlugin keeps them out of later
  turns), and no failure counted on the shared Vertex circuit breaker.
"""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from google.genai import errors as genai_errors
from google.genai import types
from src.adk.video_attachments import (
    UNREADABLE_VIDEOS_STATE_KEY,
    PreparedVideos,
    SkippedVideo,
    VideoSkipReason,
)
from src.utils.circuit_breaker import vertex_ai_breaker
from tests.unit.test_adk_orchestrator import (
    _async_iter,
    _collect_chunks,
    _make_request_and_user,
    _make_text_event,
    _parse_sse,
    _setup_mocks,
    _types,
)

GOOD = "gs://test.appspot.com/user-uploads/test-session-123/good.mp4"
GONE = "gs://test.appspot.com/user-uploads/test-session-123/gone.mp4"


def _video_part(uri: str) -> types.Part:
    return types.Part(file_data=types.FileData(file_uri=uri, mime_type="video/mp4"))


def _prepared(*, ok: tuple[str, ...] = (), gone: tuple[str, ...] = ()) -> PreparedVideos:
    return PreparedVideos(
        parts=tuple(_video_part(u) for u in ok),
        skipped=tuple(SkippedVideo(u, VideoSkipReason.NOT_FOUND) for u in gone),
    )


def _client_error(code: int = 400) -> genai_errors.ClientError:
    return genai_errors.ClientError(code, {"error": {"code": code, "message": "Unable to process input video", "status": "INVALID_ARGUMENT"}})


async def _raising(exc: BaseException):
    raise exc
    yield  # pragma: no cover - makes this an async generator


async def _text_then_raise(text: str, exc: BaseException):
    yield _make_text_event(text, partial=True)
    raise exc


@pytest.fixture(autouse=True)
def _fresh_breaker():
    vertex_ai_breaker._failures = 0
    vertex_ai_breaker._state = type(vertex_ai_breaker._state).CLOSED
    vertex_ai_breaker._opened_at = None
    yield
    vertex_ai_breaker._failures = 0
    vertex_ai_breaker._state = type(vertex_ai_breaker._state).CLOSED
    vertex_ai_breaker._opened_at = None


def _session(state: dict | None = None, history: list[types.Content] | None = None) -> SimpleNamespace:
    """An ADK session as the orchestrator sees it: state plus earlier events."""
    return SimpleNamespace(
        state=state or {},
        events=[SimpleNamespace(content=c) for c in history or []],
    )


class _Turn:
    def __init__(self, parsed: list, run_async: MagicMock, session_service: AsyncMock) -> None:
        self.parsed, self.run_async, self.session_service = parsed, run_async, session_service


async def _run(prepared: PreparedVideos, runs: list, *, session: SimpleNamespace | None = None) -> _Turn:
    """Run one turn; `runs` are the successive results of runner.run_async."""
    from src.adk.adk_orchestrator import ADKOrchestrator

    with patch("src.adk.adk_orchestrator.get_session_service") as get_session, \
         patch("src.adk.adk_orchestrator.get_conversation_repository") as get_repo, \
         patch("src.core.config.settings") as settings, \
         patch("src.adk.adk_orchestrator.prepare_video_parts", new=AsyncMock(return_value=prepared)):
        _setup_mocks(get_session, get_repo, settings)
        session_service = get_session.return_value
        session_service.get_session = AsyncMock(return_value=session or _session())
        session_service.append_event = AsyncMock()
        orch = ADKOrchestrator.__new__(ADKOrchestrator)
        orch.runner = MagicMock()
        orch.runner.run_async = MagicMock(side_effect=runs)
        req, user = _make_request_and_user()
        req.video_file_uris = [*(p.file_data.file_uri for p in prepared.parts), *(s.uri for s in prepared.skipped)]

        parsed = _parse_sse(await _collect_chunks(orch.stream_chat(req, user)))
    return _Turn(parsed, orch.runner.run_async, session_service)


def _state_restores(session_service: AsyncMock) -> list[dict]:
    """state_delta of the content-less events appended to undo a recording."""
    return [
        call.args[1].actions.state_delta
        for call in session_service.append_event.await_args_list
        if call.args[1].content is None
    ]


def _notices(parsed: list) -> list[dict]:
    return [p["data"] for p in parsed if isinstance(p, dict) and p.get("type") == "data-notice"]


def _text(parsed: list) -> str:
    return "".join(p["delta"] for p in parsed if isinstance(p, dict) and p.get("type") == "text-delta")


def _parts_sent(run_async: MagicMock, call: int = 0) -> list[types.Part]:
    return list(run_async.call_args_list[call].kwargs["new_message"].parts)


# ── Skipped before the model call ────────────────────────────────────────────

async def test_skipped_video_is_announced_and_the_model_is_told():
    turn = await _run(_prepared(ok=(GOOD,), gone=(GONE,)), [_async_iter([_make_text_event("Vedo la cucina.")])])

    assert _notices(turn.parsed) == [
        {"type": "notice", "level": "warning", "code": "VIDEO_SKIPPED",
         "message": "Un video allegato non è leggibile ed è stato ignorato."}
    ]
    sent = _parts_sent(turn.run_async)
    assert [p.file_data.file_uri for p in sent if p.file_data] == [GOOD]
    assert any("NOTA DI SISTEMA" in (p.text or "") and "ricaricarlo" in (p.text or "") for p in sent)
    assert _text(turn.parsed) == "Vedo la cucina."
    assert "error" not in _types(turn.parsed)


async def test_no_videos_no_notice_no_note():
    turn = await _run(_prepared(), [_async_iter([_make_text_event("Ciao!")])])

    assert _notices(turn.parsed) == []
    assert not any("NOTA DI SISTEMA" in (p.text or "") for p in _parts_sent(turn.run_async))


async def test_backend_without_video_support_does_not_blame_the_file():
    prepared = PreparedVideos(parts=(), skipped=(SkippedVideo(GOOD, VideoSkipReason.BACKEND_UNSUPPORTED),))

    turn = await _run(prepared, [_async_iter([_make_text_event("ok")])])

    [notice] = _notices(turn.parsed)
    assert "non è disponibile" in notice["message"]
    assert not any("ricaricarlo" in (p.text or "") for p in _parts_sent(turn.run_async))


# ── Refused by the model at runtime ──────────────────────────────────────────

async def test_refused_video_is_retried_once_without_it_and_the_breaker_is_untouched():
    turn = await _run(
        _prepared(ok=(GOOD,)),
        [_raising(_client_error(400)), _async_iter([_make_text_event("Non riesco a vedere il video, puoi ricaricarlo?")])],
    )

    assert turn.run_async.call_count == 2
    retry = turn.run_async.call_args_list[1].kwargs
    assert retry["state_delta"][UNREADABLE_VIDEOS_STATE_KEY] == [GOOD]
    retry_parts = list(retry["new_message"].parts)
    assert all(p.file_data is None for p in retry_parts)
    assert any("NOTA DI SISTEMA" in (p.text or "") for p in retry_parts)

    assert [n["code"] for n in _notices(turn.parsed)] == ["VIDEO_SKIPPED"]
    assert _text(turn.parsed) == "Non riesco a vedere il video, puoi ricaricarlo?"
    assert "error" not in _types(turn.parsed)
    assert vertex_ai_breaker.fail_count == 0  # the user's file, not a Vertex outage
    assert _state_restores(turn.session_service) == []  # the recording stands


async def test_already_refused_videos_stay_recorded():
    old = "gs://test.appspot.com/user-uploads/test-session-123/old.mp4"
    turn = await _run(
        _prepared(ok=(GOOD,)),
        [_raising(_client_error(400)), _async_iter([_make_text_event("ok")])],
        session=_session(state={UNREADABLE_VIDEOS_STATE_KEY: [old]}),
    )

    assert turn.run_async.call_args_list[1].kwargs["state_delta"][UNREADABLE_VIDEOS_STATE_KEY] == [old, GOOD]


async def test_one_notice_counts_skipped_and_refused_videos():
    # The UI keeps only the latest notice: it must carry the whole count.
    turn = await _run(
        _prepared(ok=(GOOD,), gone=(GONE,)),
        [_raising(_client_error(400)), _async_iter([_make_text_event("ok")])],
    )

    assert _notices(turn.parsed)[-1]["message"] == "2 video allegati non sono leggibili e sono stati ignorati."


async def test_a_video_from_an_earlier_message_no_longer_blocks_the_session():
    # Accepted in an earlier turn, deleted from Storage since: ADK resends it from
    # history on every call. The turn has no video of its own, yet it must recover.
    history = [types.Content(role="user", parts=[types.Part(text="guarda"), _video_part(GONE)])]
    turn = await _run(
        _prepared(),
        [_raising(_client_error(400)), _async_iter([_make_text_event("Certo, dimmi.")])],
        session=_session(history=history),
    )

    assert turn.run_async.call_count == 2
    assert turn.run_async.call_args_list[1].kwargs["state_delta"][UNREADABLE_VIDEOS_STATE_KEY] == [GONE]
    assert _notices(turn.parsed)[-1]["message"] == (
        "Un video inviato in precedenza non è più leggibile ed è stato escluso dalla conversazione."
    )
    assert _text(turn.parsed) == "Certo, dimmi."


async def test_videos_already_recorded_do_not_trigger_a_retry():
    history = [types.Content(role="user", parts=[_video_part(GONE)])]
    turn = await _run(
        _prepared(),
        [_raising(_client_error(400))],
        session=_session(state={UNREADABLE_VIDEOS_STATE_KEY: [GONE]}, history=history),
    )

    assert turn.run_async.call_count == 1  # already kept out by VideoGuardPlugin
    assert "error" in _types(turn.parsed)


async def test_client_error_without_any_video_is_a_plain_error():
    turn = await _run(_prepared(), [_raising(_client_error(400))])

    assert turn.run_async.call_count == 1
    assert "error" in _types(turn.parsed)
    assert vertex_ai_breaker.fail_count == 1


async def test_no_retry_once_the_reply_has_started():
    turn = await _run(_prepared(ok=(GOOD,)), [_text_then_raise("Vedo", _client_error(400))])

    assert turn.run_async.call_count == 1
    assert "error" in _types(turn.parsed)


async def test_quota_errors_are_not_mistaken_for_a_bad_video():
    turn = await _run(_prepared(ok=(GOOD,)), [_raising(_client_error(429))])

    assert turn.run_async.call_count == 1
    assert "error" in _types(turn.parsed)


async def test_a_retry_that_fails_too_clears_the_videos_name():
    # The turn failed without the video as well: the video was not the cause, so
    # it must not stay recorded as unreadable for the rest of the session.
    old = "gs://test.appspot.com/user-uploads/test-session-123/old.mp4"
    turn = await _run(
        _prepared(ok=(GOOD,)),
        [_raising(_client_error(400)), _raising(_client_error(400))],
        session=_session(state={UNREADABLE_VIDEOS_STATE_KEY: [old]}),
    )

    assert turn.run_async.call_count == 2
    assert "error" in _types(turn.parsed)
    assert vertex_ai_breaker.fail_count == 1
    assert _state_restores(turn.session_service) == [{UNREADABLE_VIDEOS_STATE_KEY: [old]}]


async def test_a_retry_that_fails_after_answering_keeps_the_recording():
    turn = await _run(
        _prepared(ok=(GOOD,)),
        [_raising(_client_error(400)), _text_then_raise("Senza il video posso dirti", RuntimeError("timeout"))],
    )

    assert "error" in _types(turn.parsed)
    assert _state_restores(turn.session_service) == []
