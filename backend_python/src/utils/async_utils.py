import functools
from typing import TypeVar, Callable, Any
from starlette.concurrency import run_in_threadpool

T = TypeVar("T")

async def run_blocking(func: Callable[..., T], *args: Any, **kwargs: Any) -> T:
    """
    Run a blocking (synchronous) function in a separate thread.
    Use this for heavy I/O or CPU bound tasks (regex, image processing)
    to avoid blocking the main async event loop.
    """
    return await run_in_threadpool(functools.partial(func, *args, **kwargs))
