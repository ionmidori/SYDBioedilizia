"""Storage references of a chat, rewritten for the chat its media are copied to.

Messages and files point at media by signed URL, `gs://` URI or object path
under the chat's own prefixes; the backend only reads media under the prefixes
of the chat it serves (`session_media_path`). After a copy every reference to a
copied object must name the copy: same form, destination prefix. A Firebase
download URL keeps its token (the copy keeps the object's metadata, token
included); a signed URL is signed again (its signature covers the old path).
"""
import re
from collections.abc import Callable
from typing import Any
from urllib.parse import quote, urlparse

from src.core.config import settings
from src.utils.download import parse_storage_ref

# URLs and URIs inside free text (assistant replies, tool results as JSON).
# A backslash ends one (an escape in JSON text), and so does trailing sentence
# punctuation, which never ends an object path or a signature.
_REF_IN_TEXT = re.compile(r"(?:https?|gs)://[^\s\"'<>()\[\]\\]+")
_TRAILING_PUNCTUATION = ".,;:!?"
_FIREBASE_HOST = "firebasestorage.googleapis.com"


def media_prefixes(chat_id: str) -> tuple[str, ...]:
    """Prefixes of a chat's media, the objects a merge copies: chat uploads,
    renders, dashboard uploads. Quote PDFs (`projects/{id}/quotes/`) stay with
    their chat and its quote."""
    return (f"user-uploads/{chat_id}/", f"renders/{chat_id}/", f"projects/{chat_id}/uploads/")


def moved_path(path: str, source_id: str, dest_id: str) -> str | None:
    """Path of the copy of a source media object; None when it is not one."""
    if ".." in path.split("/"):
        return None
    for prefix, target in zip(media_prefixes(source_id), media_prefixes(dest_id), strict=True):
        if path.startswith(prefix):
            return target + path[len(prefix):]
    return None


def rewrite_ref(ref: str, source_id: str, dest_id: str, sign: Callable[[str], str]) -> str | None:
    """The reference to the copy, in the same form; None when `ref` is not a
    source media object in the app bucket."""
    parsed = parse_storage_ref(ref)
    if parsed is None:
        return None
    bucket, path = parsed
    if bucket is not None and bucket != settings.FIREBASE_STORAGE_BUCKET:
        return None
    target = moved_path(path, source_id, dest_id)
    if target is None:
        return None
    if ref.startswith("gs://"):
        return f"gs://{bucket}/{target}"
    if "://" not in ref:
        return target
    url = urlparse(ref)
    if (url.hostname or "").lower() == _FIREBASE_HOST:
        # /v0/b/<bucket>/o/<encoded path>: same token, new path.
        head = url.path[: url.path.index("/o/") + len("/o/")]
        return url._replace(path=head + quote(target, safe="")).geturl()
    return sign(target)


def _rewrite_match(match: re.Match[str], source_id: str, dest_id: str, sign: Callable[[str], str]) -> str:
    found = match.group(0)
    ref = found.rstrip(_TRAILING_PUNCTUATION)
    rewritten = rewrite_ref(ref, source_id, dest_id, sign)
    return found if rewritten is None else rewritten + found[len(ref):]


def _rewrite_text(text: str, source_id: str, dest_id: str, sign: Callable[[str], str]) -> str:
    if "://" not in text:  # a bare object path, or plain text
        return rewrite_ref(text, source_id, dest_id, sign) or text
    return _REF_IN_TEXT.sub(lambda m: _rewrite_match(m, source_id, dest_id, sign), text)


def rewrite_refs(value: Any, source_id: str, dest_id: str, sign: Callable[[str], str]) -> Any:
    """`value` (strings, lists, maps) with every source media reference rewritten.
    `sign` may block (it can call IAM): run this off the event loop."""
    if isinstance(value, str):
        return _rewrite_text(value, source_id, dest_id, sign)
    if isinstance(value, dict):
        return {key: rewrite_refs(item, source_id, dest_id, sign) for key, item in value.items()}
    if isinstance(value, list):
        return [rewrite_refs(item, source_id, dest_id, sign) for item in value]
    return value
