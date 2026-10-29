"""Storage objects of the chats being merged (Firebase Admin bucket).

The SDK is blocking: listing and copying run in a thread. `signed_url` blocks
too (on Cloud Run signing calls IAM): callers run it off the event loop.
"""
import asyncio
from datetime import timedelta
from typing import Any

from google.api_core.exceptions import PreconditionFailed

# The longest a V4 signature allows: a copied URL never lives shorter than the
# one it replaces (chat uploads 1 hour, renders 7 days). Readers that need
# longer re-sign from the object path, as everywhere else in the backend.
SIGNED_URL_TTL = timedelta(days=7)
_COPY_CONCURRENCY = 8


class MediaStore:
    def __init__(self, bucket: Any) -> None:
        self._bucket = bucket

    async def list_paths(self, prefixes: tuple[str, ...]) -> list[str]:
        def _list() -> list[str]:
            return [
                blob.name
                for prefix in prefixes
                for blob in self._bucket.list_blobs(prefix=prefix)
                if not blob.name.endswith("/")
            ]

        return await asyncio.to_thread(_list)

    async def copy_all(self, pairs: list[tuple[str, str]]) -> None:
        """Copy (source, target) pairs a few at a time (each copy is a round trip)."""
        limit = asyncio.Semaphore(_COPY_CONCURRENCY)

        async def one(source: str, target: str) -> None:
            async with limit:
                await self.copy(source, target)

        await asyncio.gather(*(one(source, target) for source, target in pairs))

    async def copy(self, source: str, target: str) -> bool:
        """Copy an object unless the target exists (then False): the generation
        precondition makes "already copied" an atomic check, not a race."""

        def _copy() -> bool:
            try:
                self._bucket.copy_blob(self._bucket.blob(source), self._bucket, target, if_generation_match=0)
            except PreconditionFailed:
                return False
            return True

        return await asyncio.to_thread(_copy)

    def signed_url(self, path: str) -> str:
        return self._bucket.blob(path).generate_signed_url(expiration=SIGNED_URL_TTL, version="v4")
