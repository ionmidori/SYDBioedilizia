"""Which attached videos reach the model, and what the user/model are told about
the ones that do not. A broken video must never fail the whole reply."""
from unittest.mock import MagicMock, patch

import pytest
from google.api_core.exceptions import ServiceUnavailable
from google.genai import errors as genai_errors
from google.genai import types
from src.adk import video_attachments
from src.adk.video_attachments import (
    PreparedVideos,
    SkippedVideo,
    VideoSkipReason,
    is_media_rejection,
    prepare_video_parts,
    skipped_model_note,
    skipped_notice_text,
    video_uris_in,
)
from src.core.media_policy import MAX_VIDEO_SIZE

_BUCKET = "app-bucket"


def _uri(path: str) -> str:
    return f"gs://{_BUCKET}/{path}"


def _file(uri: str, mime: str = "video/mp4") -> types.Part:
    return types.Part(file_data=types.FileData(file_uri=uri, mime_type=mime))


def _blob(size: int = 1024, content_type: str = "video/mp4") -> MagicMock:
    blob = MagicMock()
    blob.size = size
    blob.content_type = content_type
    return blob


def _storage(blobs: dict[str, MagicMock | None] | None = None, error: Exception | None = None) -> MagicMock:
    """fb_storage.bucket(name) whose get_blob(path) answers from `blobs` (None = missing)."""
    bucket = MagicMock()
    if error is not None:
        bucket.get_blob.side_effect = error
    else:
        bucket.get_blob.side_effect = lambda path, **_kwargs: (blobs or {}).get(path, _blob())
    return MagicMock(return_value=bucket)


async def _prepare(uris: list[str], *, storage: MagicMock | None = None, vertex: bool = True) -> PreparedVideos:
    with patch.object(video_attachments.fb_storage, "bucket", storage or _storage()):
        return await prepare_video_parts(uris, session_id="sess-1", bucket_name=_BUCKET, vertex=vertex)


def _accepted(prepared: PreparedVideos) -> list[tuple[str, str]]:
    return [(p.file_data.file_uri, p.file_data.mime_type) for p in prepared.parts]


def _reasons(prepared: PreparedVideos) -> list[VideoSkipReason]:
    return [s.reason for s in prepared.skipped]


# ── URI checks (security: unchanged from _video_parts) ───────────────────────

async def test_accepts_own_session_files_with_the_mime_type_stored_in_storage():
    uris = [_uri("user-uploads/sess-1/a.mp4"), _uri("projects/sess-1/uploads/b.mov"), _uri("user-uploads/sess-1/c.webm")]
    storage = _storage({
        "user-uploads/sess-1/a.mp4": _blob(content_type="video/mp4"),
        "projects/sess-1/uploads/b.mov": _blob(content_type="video/quicktime"),
        "user-uploads/sess-1/c.webm": _blob(content_type="video/webm"),
    })

    prepared = await _prepare(uris, storage=storage)

    assert _accepted(prepared) == [(uris[0], "video/mp4"), (uris[1], "video/quicktime"), (uris[2], "video/webm")]
    assert prepared.skipped == ()


@pytest.mark.parametrize(
    "uri",
    [
        _uri("user-uploads/other-session/a.mp4"),  # another user's session
        _uri("user-uploads/sess-10/a.mp4"),  # prefix lookalike
        _uri("user-uploads/sess-1/../other/a.mp4"),  # traversal
        "gs://foreign-bucket/user-uploads/sess-1/a.mp4",
        "https://generativelanguage.googleapis.com/v1beta/files/abc",  # old File API URI
        _uri("portfolio/a.mp4"),
    ],
)
async def test_rejects_uris_outside_the_session_without_touching_storage(uri):
    storage = _storage()

    prepared = await _prepare([uri], storage=storage)

    assert prepared.parts == ()
    assert _reasons(prepared) == [VideoSkipReason.OUTSIDE_SESSION]
    storage.return_value.get_blob.assert_not_called()


async def test_videos_are_skipped_off_vertex():
    prepared = await _prepare([_uri("user-uploads/sess-1/a.mp4")], vertex=False)

    assert prepared.parts == ()
    assert _reasons(prepared) == [VideoSkipReason.BACKEND_UNSUPPORTED]


async def test_no_videos_means_nothing_to_do():
    storage = _storage()
    prepared = await _prepare([], storage=storage)

    assert prepared == PreparedVideos(parts=(), skipped=())
    storage.assert_not_called()


# ── Storage metadata checks (new) ────────────────────────────────────────────

@pytest.mark.parametrize(
    ("blob", "reason"),
    [
        (None, VideoSkipReason.NOT_FOUND),
        (_blob(size=0), VideoSkipReason.EMPTY),
        (_blob(size=MAX_VIDEO_SIZE + 1), VideoSkipReason.TOO_LARGE),
        (_blob(content_type="video/x-msvideo"), VideoSkipReason.UNSUPPORTED_TYPE),
        (_blob(content_type=None), VideoSkipReason.UNSUPPORTED_TYPE),
    ],
)
async def test_unusable_objects_are_skipped(blob, reason):
    path = "user-uploads/sess-1/a.mp4"

    prepared = await _prepare([_uri(path)], storage=_storage({path: blob}))

    assert prepared.parts == ()
    assert prepared.skipped == (SkippedVideo(uri=_uri(path), reason=reason),)


async def test_one_bad_video_does_not_drop_the_good_ones():
    good, gone = "user-uploads/sess-1/good.mp4", "user-uploads/sess-1/gone.mp4"

    prepared = await _prepare([_uri(good), _uri(gone)], storage=_storage({gone: None}))

    assert _accepted(prepared) == [(_uri(good), "video/mp4")]
    assert _reasons(prepared) == [VideoSkipReason.NOT_FOUND]


async def test_storage_lookup_failure_keeps_the_video():
    # Storage not answering says nothing about the video: keep it and let the
    # model call decide (a rejection there is handled at runtime).
    prepared = await _prepare(
        [_uri("user-uploads/sess-1/a.mov")], storage=_storage(error=ServiceUnavailable("gcs down"))
    )

    assert _accepted(prepared) == [(_uri("user-uploads/sess-1/a.mov"), "video/quicktime")]
    assert prepared.skipped == ()


async def test_unexpected_storage_errors_keep_the_video_too():
    # e.g. firebase_admin.storage.bucket() raising ValueError (app not initialised):
    # the metadata check is best-effort and must never fail the turn.
    prepared = await _prepare([_uri("user-uploads/sess-1/a.mp4")], storage=_storage(error=ValueError("no app")))

    assert _accepted(prepared) == [(_uri("user-uploads/sess-1/a.mp4"), "video/mp4")]


async def test_storage_lookup_is_bounded_in_time():
    # GCS defaults (60s per attempt, retries for up to 120s) would stall the turn
    # before its own timeout even starts; past the bound the video is sent unchecked.
    storage = _storage()

    await _prepare([_uri("user-uploads/sess-1/a.mp4")], storage=storage)

    _, kwargs = storage.return_value.get_blob.call_args
    assert 0 < kwargs["timeout"] <= 10
    assert 0 < kwargs["retry"].timeout <= 10  # total budget across retries


async def test_prepared_videos_expose_the_included_uris():
    path = "user-uploads/sess-1/a.mp4"
    prepared = await _prepare([_uri(path)])

    assert prepared.uris == (_uri(path),)


async def test_prepared_videos_know_when_videos_are_simply_not_supported():
    off_vertex = await _prepare([_uri("user-uploads/sess-1/a.mp4")], vertex=False)
    missing = await _prepare(
        [_uri("user-uploads/sess-1/a.mp4")], storage=_storage({"user-uploads/sess-1/a.mp4": None})
    )

    assert off_vertex.only_unsupported is True
    assert missing.only_unsupported is False


# ── Videos already in the conversation ───────────────────────────────────────

def test_video_uris_in_lists_file_data_videos_once_in_order():
    contents = [
        types.Content(role="user", parts=[types.Part(text="ciao"), _file(_uri("a.mp4"))]),
        types.Content(role="model", parts=[types.Part(text="ok")]),
        types.Content(role="user", parts=None),
        types.Content(role="user", parts=[_file(_uri("b.mov"), "video/quicktime"), _file(_uri("a.mp4"))]),
        types.Content(role="user", parts=[_file(_uri("doc.pdf"), "application/pdf")]),
    ]

    assert video_uris_in(contents) == [_uri("a.mp4"), _uri("b.mov")]


# ── What the user and the model are told ─────────────────────────────────────

def test_notice_for_videos_of_this_message():
    assert skipped_notice_text(current=1) == "Un video allegato non è leggibile ed è stato ignorato."
    assert skipped_notice_text(current=3) == "3 video allegati non sono leggibili e sono stati ignorati."


def test_notice_counts_every_video_left_out_of_the_turn():
    # One dropped before the call, one refused by the model, one from history.
    assert skipped_notice_text(current=2, earlier=1) == "3 video allegati non sono leggibili e sono stati ignorati."


def test_notice_for_a_video_of_an_earlier_message():
    assert skipped_notice_text(earlier=1) == (
        "Un video inviato in precedenza non è più leggibile ed è stato escluso dalla conversazione."
    )
    assert skipped_notice_text(earlier=2) == (
        "2 video inviati in precedenza non sono più leggibili e sono stati esclusi dalla conversazione."
    )


def test_notice_when_video_analysis_is_not_available_does_not_blame_the_file():
    text = skipped_notice_text(current=1, unsupported=True)

    assert "non è disponibile" in text
    assert "leggibile" not in text


def test_model_note_forbids_describing_the_missing_video():
    note = skipped_model_note(2)

    assert note.text is not None
    assert "2 video" in note.text
    assert "non descriverne il contenuto" in note.text.lower()
    assert "ricaricarlo" in note.text


def test_model_note_does_not_ask_for_a_reupload_that_cannot_help():
    note = skipped_model_note(1, reupload_helps=False)

    assert "ricaricarlo" not in (note.text or "")


# ── Runtime rejection by the model ───────────────────────────────────────────

def _client_error(code: int) -> genai_errors.ClientError:
    return genai_errors.ClientError(code, {"error": {"code": code, "message": "x", "status": "X"}})


@pytest.mark.parametrize("code", [400, 403, 404])
def test_client_errors_about_the_request_are_media_rejections(code):
    assert is_media_rejection(_client_error(code)) is True


@pytest.mark.parametrize(
    "error",
    [
        "429",  # quota: retrying without the video does not help
        "500",
        RuntimeError("boom"),
        TimeoutError(),
    ],
)
def test_other_failures_are_not_media_rejections(error):
    if error == "429":
        error = _client_error(429)
    elif error == "500":
        error = genai_errors.ServerError(500, {"error": {"code": 500, "message": "x", "status": "INTERNAL"}})
    assert is_media_rejection(error) is False
