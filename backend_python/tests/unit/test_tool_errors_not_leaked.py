"""Security audit 2026-10-03, L4: tool results reach the user (stream_tool_result)
without going through the output filter, so they must not carry exception text."""
from unittest.mock import AsyncMock, patch

from src.tools.generate_render import generate_render_wrapper

SECRET = "gs://internal-bucket/service-account.json"


async def test_render_failure_does_not_return_the_exception_text():
    with patch(
        "src.tools.generate_render.generate_image_t2i",
        new=AsyncMock(side_effect=RuntimeError(SECRET)),
    ):
        out = await generate_render_wrapper(
            prompt="cucina", room_type="kitchen", style="moderno", session_id="s1"
        )
    assert out["status"] == "error"
    assert SECRET not in str(out)
