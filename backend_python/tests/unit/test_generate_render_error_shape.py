"""Regression test: generate_render_wrapper must always return a dict.

The pyright reportReturnType ratchet surfaced that generate_render_wrapper (typed
-> Dict[str, Any]) returned a bare *str* on two error paths. Its ADK tool caller
does result.get(...) / result["imageUrl"], so a str return crashed the tool with
AttributeError instead of degrading gracefully. Error paths must return an error
dict shaped like the success/error dicts the caller already handles.
"""
from unittest.mock import AsyncMock, patch

import pytest
from src.tools import generate_render as gr


@pytest.mark.asyncio
async def test_generate_render_failure_returns_error_dict():
    # Creation (T2I) path: image generation reports failure.
    with patch.object(
        gr, "generate_image_t2i", new=AsyncMock(return_value={"success": False})
    ):
        result = await gr.generate_render_wrapper(
            prompt="a cozy room",
            room_type="kitchen",
            style="modern",
            session_id="s1",
            mode="creation",
        )

    # Before the fix this returned a bare str, which the caller's result.get(...)
    # / result["imageUrl"] would crash on.
    assert isinstance(result, dict), f"expected dict, got {type(result)}: {result!r}"
    assert result.get("status") == "error"
