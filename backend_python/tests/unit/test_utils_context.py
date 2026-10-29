"""src.utils.context — request-scoped ContextVar getters/setters."""
from __future__ import annotations

import contextvars

from src.utils.context import (
    get_current_media_metadata,
    get_current_user_id,
    set_current_media_metadata,
    set_current_user_id,
)


def _in_fresh_context(fn):
    """Run fn in an empty context so values set by other tests do not leak in."""
    return contextvars.Context().run(fn)


def test_user_id_default():
    assert _in_fresh_context(get_current_user_id) == "default"


def test_set_and_get_user_id():
    def scenario():
        set_current_user_id("user-abc")
        return get_current_user_id()

    assert _in_fresh_context(scenario) == "user-abc"


def test_media_metadata_default():
    assert _in_fresh_context(get_current_media_metadata) is None


def test_set_and_get_media_metadata():
    meta = {"trim_start": 0, "trim_end": 10}

    def scenario():
        set_current_media_metadata(meta)
        return get_current_media_metadata()

    assert _in_fresh_context(scenario) == meta

