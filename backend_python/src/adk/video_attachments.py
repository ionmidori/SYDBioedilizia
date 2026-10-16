"""Videos attached to a chat turn: which ones reach the model, and what the user
and the model are told about the ones that do not.

A broken video must cost the user that video, never the whole reply:

1. Before the model call (`prepare_video_parts`): the URI must point inside the
   session's own Storage prefixes (Vertex reads it with the project's service
   agent, so an arbitrary path would expose another user's file), and the object
   must exist, be non-empty, within the size limit and of an accepted type.
2. During the model call (`is_media_rejection`): Vertex may still refuse a video
   that passes those checks (corrupt file, unsupported codec); the orchestrator
   then retries the turn once without videos.
3. Afterwards: the rejected URIs are recorded in the ADK session state and
   `VideoGuardPlugin` keeps them out of every later request.
"""
from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from enum import StrEnum
from urllib.parse import urlparse

from firebase_admin import storage as fb_storage
from google.cloud.storage.retry import DEFAULT_RETRY
from google.genai import errors as genai_errors
from google.genai import types

from src.core.media_policy import MAX_VIDEO_SIZE, VIDEO_EXTENSION_MIMES, VIDEO_MIME_EXTENSIONS
from src.utils.download import session_storage_prefixes

logger = logging.getLogger(__name__)

# ADK session-state key listing the gs:// URIs the model refused (VideoGuardPlugin).
UNREADABLE_VIDEOS_STATE_KEY = "unreadable_video_uris"

# Client errors that mean "this request (its media) is not acceptable": a retry
# without the videos can succeed. 429 (quota) and 5xx are not about the media.
_MEDIA_REJECTION_CODES = frozenset({400, 403, 404})

# The metadata check runs before the turn's own timeout starts: bound each
# attempt and the whole retry budget (past it the video is sent unchecked and
# the model call decides).
_STORAGE_TIMEOUT_S = 5


class VideoSkipReason(StrEnum):
    OUTSIDE_SESSION = "outside_session"          # not one of this session's Storage files
    BACKEND_UNSUPPORTED = "backend_unsupported"  # gs:// input needs Vertex AI
    NOT_FOUND = "not_found"
    EMPTY = "empty"
    TOO_LARGE = "too_large"
    UNSUPPORTED_TYPE = "unsupported_type"


@dataclass(frozen=True)
class SkippedVideo:
    uri: str
    reason: VideoSkipReason


@dataclass(frozen=True)
class PreparedVideos:
    parts: tuple[types.Part, ...]
    skipped: tuple[SkippedVideo, ...]

    @property
    def uris(self) -> tuple[str, ...]:
        """gs:// URIs of the videos that will be sent to the model."""
        return tuple(p.file_data.file_uri for p in self.parts if p.file_data and p.file_data.file_uri)

    @property
    def only_unsupported(self) -> bool:
        """Every skipped video was dropped because this backend cannot read videos
        at all — nothing is wrong with the files, so a re-upload cannot help."""
        return bool(self.skipped) and all(s.reason is VideoSkipReason.BACKEND_UNSUPPORTED for s in self.skipped)


def video_uris_in(contents: Iterable[types.Content]) -> list[str]:
    """gs:// video URIs carried by `file_data` parts, once each, in order."""
    uris: list[str] = []
    for content in contents:
        for part in content.parts or ():
            data = part.file_data
            if data and data.file_uri and (data.mime_type or "").startswith("video/") and data.file_uri not in uris:
                uris.append(data.file_uri)
    return uris


def _session_path(uri: str, *, session_id: str, bucket_name: str) -> str | None:
    """Object path of `uri` when it is one of this session's files, else None."""
    parsed = urlparse(uri)
    path = parsed.path.lstrip("/")
    if (
        parsed.scheme != "gs"
        or not bucket_name
        or parsed.netloc != bucket_name
        or ".." in path.split("/")
        or not path.startswith(session_storage_prefixes(session_id))
    ):
        return None
    return path


def _mime_from_extension(path: str) -> str:
    return VIDEO_EXTENSION_MIMES.get(path.rsplit(".", 1)[-1].lower(), "video/mp4")


def _object_metadata(bucket_name: str, path: str) -> tuple[int | None, str | None] | None:
    """(size, content_type) of a Storage object, None if it does not exist. Sync."""
    blob = fb_storage.bucket(bucket_name).get_blob(
        path, timeout=_STORAGE_TIMEOUT_S, retry=DEFAULT_RETRY.with_timeout(_STORAGE_TIMEOUT_S)
    )
    if blob is None:
        return None
    return blob.size, blob.content_type


async def _check(uri: str, path: str, bucket_name: str) -> types.Part | SkippedVideo:
    try:
        metadata = await asyncio.to_thread(_object_metadata, bucket_name, path)
    except Exception:
        # Best-effort check: whatever went wrong with Storage says nothing about
        # the video itself. Send it and let the model call decide (a rejection
        # there is retried without it) — never fail the turn here.
        logger.warning("[Video] Storage lookup failed, sending the video unchecked", exc_info=True)
        return types.Part(file_data=types.FileData(file_uri=uri, mime_type=_mime_from_extension(path)))

    if metadata is None:
        return SkippedVideo(uri, VideoSkipReason.NOT_FOUND)
    size, content_type = metadata
    if not size:
        return SkippedVideo(uri, VideoSkipReason.EMPTY)
    if size > MAX_VIDEO_SIZE:
        return SkippedVideo(uri, VideoSkipReason.TOO_LARGE)
    if content_type not in VIDEO_MIME_EXTENSIONS:
        return SkippedVideo(uri, VideoSkipReason.UNSUPPORTED_TYPE)
    return types.Part(file_data=types.FileData(file_uri=uri, mime_type=content_type))


async def prepare_video_parts(
    uris: Sequence[str], *, session_id: str, bucket_name: str, vertex: bool
) -> PreparedVideos:
    """`file_data` parts for the usable videos of this turn, plus the skipped ones."""
    if not uris:
        return PreparedVideos(parts=(), skipped=())
    if not vertex:
        logger.warning("[Video] Video attachments need Vertex AI (gs:// input): skipped")
        return PreparedVideos(parts=(), skipped=tuple(SkippedVideo(u, VideoSkipReason.BACKEND_UNSUPPORTED) for u in uris))

    async def _one(uri: str) -> types.Part | SkippedVideo:
        path = _session_path(uri, session_id=session_id, bucket_name=bucket_name)
        if path is None:
            logger.warning("[Video] Rejected video URI outside the session's files")
            return SkippedVideo(uri, VideoSkipReason.OUTSIDE_SESSION)
        return await _check(uri, path, bucket_name)

    results = await asyncio.gather(*(_one(uri) for uri in uris))  # keeps the order
    skipped = tuple(r for r in results if isinstance(r, SkippedVideo))
    for s in skipped:
        logger.warning("[Video] Skipped attached video: %s", s.reason)
    return PreparedVideos(parts=tuple(r for r in results if isinstance(r, types.Part)), skipped=skipped)


def skipped_notice_text(*, current: int = 0, earlier: int = 0, unsupported: bool = False) -> str:
    """What the user is told (Italian) about the videos left out of this turn.

    `current`: videos of this message; `earlier`: videos of earlier messages the
    model no longer accepts; `unsupported`: this backend cannot read videos at
    all (not the files' fault). One notice carries the whole count, since the UI
    shows only the latest one.
    """
    if unsupported:
        if current == 1:
            return "L'analisi dei video non è disponibile al momento: il video allegato è stato ignorato."
        return f"L'analisi dei video non è disponibile al momento: i {current} video allegati sono stati ignorati."
    if current:
        total = current + earlier
        if total == 1:
            return "Un video allegato non è leggibile ed è stato ignorato."
        return f"{total} video allegati non sono leggibili e sono stati ignorati."
    if earlier == 1:
        return "Un video inviato in precedenza non è più leggibile ed è stato escluso dalla conversazione."
    return f"{earlier} video inviati in precedenza non sono più leggibili e sono stati esclusi dalla conversazione."


def skipped_model_note(count: int, *, reupload_helps: bool = True) -> types.Part:
    """What the model is told, so it says the video is missing instead of inventing it."""
    subject = "1 video inviato dall'utente non è leggibile ed è stato escluso" if count == 1 else (
        f"{count} video inviati dall'utente non sono leggibili e sono stati esclusi"
    )
    advice = (
        "avvisalo che non è stato possibile leggerlo e chiedigli di ricaricarlo se serve"
        if reupload_helps
        else "avvisalo che al momento l'analisi dei video non è disponibile"
    )
    return types.Part(
        text=(
            f"[NOTA DI SISTEMA: {subject}. Non descriverne il contenuto: rispondi al messaggio "
            f"dell'utente senza il video e {advice}.]"
        )
    )


def is_media_rejection(exc: BaseException) -> bool:
    """The model refused the request itself (bad media), not a capacity or server problem."""
    return isinstance(exc, genai_errors.ClientError) and exc.code in _MEDIA_REJECTION_CODES
