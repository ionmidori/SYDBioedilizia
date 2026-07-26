import functools
from collections.abc import Callable
from typing import Any

from starlette.concurrency import run_in_threadpool


async def run_blocking[T](func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """
    Run a blocking (synchronous) function in a separate thread.
    Use this for heavy I/O or CPU bound tasks (regex, image processing)
    to avoid blocking the main async event loop.
    """
    return await run_in_threadpool(functools.partial(func, *args, **kwargs))
