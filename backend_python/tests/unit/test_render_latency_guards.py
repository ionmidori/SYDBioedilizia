"""Regression tests for render timeout root causes:
1. generate_render (I2I) must not block on analyze_image_triage before Architect.
2. generate_architectural_prompt must bound thinking_config, JSON output, and timeout.
3. analyze_image_triage must not enable code_execution or close the shared genai client.
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.asyncio
async def test_triage_does_not_enable_code_execution_or_close_shared_client(sample_image_bytes):
    from src.vision.triage import analyze_image_triage

    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "roomType": "living room",
        "currentStyle": "modern",
        "keyFeatures": ["window"],
        "condition": "good",
        "renovationNotes": "ok",
    })
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("src.vision.triage.get_genai_client", return_value=mock_client):
        result = await analyze_image_triage(sample_image_bytes)

    assert result["success"] is True
    # Must never close the @lru_cache singleton client
    mock_client.close.assert_not_called()
    # Must not invoke remote Python code_execution sandbox during simple room triage
    _, kwargs = mock_client.aio.models.generate_content.call_args
    cfg = kwargs["config"]
    assert not cfg.tools
    from src.core.models import ModelRole, build_thinking_config

    assert cfg.thinking_config == build_thinking_config(ModelRole.VISION)
    assert cfg.response_mime_type == "application/json"
    assert cfg.max_output_tokens is None


@pytest.mark.asyncio
async def test_architect_bounds_thinking_json_and_times_out_cleanly(sample_image_bytes):
    from src.core.models import ModelRole, build_thinking_config
    from src.vision.architect import generate_architectural_prompt

    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "structuralSkeleton": "Walls and window",
        "materialPlan": "Oak floor",
        "furnishingStrategy": "Modern sofa",
        "technicalNotes": "Natural daylight",
    })
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("src.vision.architect.get_genai_client", return_value=mock_client):
        await generate_architectural_prompt(
            image_bytes=sample_image_bytes,
            target_style="contemporary",
            mime_type="image/jpeg",
        )

    _, kwargs = mock_client.aio.models.generate_content.call_args
    cfg = kwargs["config"]
    assert cfg.thinking_config == build_thinking_config(ModelRole.VISION)
    assert cfg.response_mime_type == "application/json"
    assert cfg.max_output_tokens is None

    # Slow response must fall back cleanly within 12s rather than hanging until the 180s ADK timeout
    from src.vision import architect as architect_mod
    assert architect_mod._ARCHITECT_TIMEOUT_SECONDS <= 12.0

    async def _hang(*_a, **_kw):
        await asyncio.sleep(5)

    mock_client.aio.models.generate_content = AsyncMock(side_effect=_hang)
    with (
        patch("src.vision.architect.get_genai_client", return_value=mock_client),
        patch("src.vision.architect._ARCHITECT_TIMEOUT_SECONDS", 0.05),
    ):
        fallback = await generate_architectural_prompt(
            image_bytes=sample_image_bytes,
            target_style="contemporary",
            mime_type="image/jpeg",
        )
    assert isinstance(fallback, architect_mod.ArchitectOutput)
    assert "contemporary" in fallback.material_plan.lower()


@pytest.mark.asyncio
async def test_architect_downscales_large_image_before_gemini_call():
    import io

    from PIL import Image
    from src.vision.architect import generate_architectural_prompt

    # Create a large 3000x2000 PNG to simulate a smartphone upload
    buf = io.BytesIO()
    Image.new("RGB", (3000, 2000), color=(180, 160, 140)).save(buf, format="PNG")
    large_png = buf.getvalue()

    mock_response = MagicMock()
    mock_response.text = json.dumps({
        "structuralSkeleton": "Walls",
        "materialPlan": "Oak",
        "furnishingStrategy": "Sofa",
        "technicalNotes": "24mm",
    })
    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)

    with patch("src.vision.architect.get_genai_client", return_value=mock_client):
        await generate_architectural_prompt(
            image_bytes=large_png,
            target_style="minimal",
            mime_type="image/png",
        )

    _, kwargs = mock_client.aio.models.generate_content.call_args
    blob = kwargs["contents"][0].parts[1].inline_data
    assert blob.mime_type == "image/jpeg"
    sent_img = Image.open(io.BytesIO(blob.data))
    assert max(sent_img.size) <= 1024


@pytest.mark.asyncio
async def test_generate_render_i2i_skips_redundant_triage_call(sample_image_bytes):
    from src.tools.generate_render import generate_render_wrapper
    from src.vision.architect import ArchitectOutput

    arch = ArchitectOutput(
        structural_skeleton="Walls",
        material_plan="Wood",
        furnishing_strategy="Sofa",
        technical_notes="24mm",
    )
    triage_mock = AsyncMock()

    with (
        patch("src.tools.generate_render.download_image_smart", AsyncMock(return_value=(sample_image_bytes, "image/jpeg"))),
        patch("src.vision.triage.analyze_image_triage", triage_mock),
        patch("src.vision.architect.generate_architectural_prompt", AsyncMock(return_value=arch)),
        patch(
            "src.tools.generate_render.generate_image_i2i",
            AsyncMock(return_value={"success": True, "image_base64": "AAAA", "mime_type": "image/png"}),
        ),
        patch("src.tools.generate_render._upload_base64_image_sync", return_value="https://storage.googleapis.com/b/renders/x.png"),
        patch("src.tools.generate_render.get_room_repository") as mock_room_repo,
        patch("src.tools.generate_render.get_conversation_repository") as mock_conv_repo,
    ):
        mock_room_repo.return_value.find_file_by_storage_path = AsyncMock(return_value=None)
        mock_conv_repo.return_value.save_file_metadata = AsyncMock(return_value=None)

        out = await generate_render_wrapper(
            prompt="stile contemporaneo",
            room_type="living room",
            style="contemporary",
            mode="modification",
            source_image_url="https://storage.googleapis.com/chatbotluca-a8a73.firebasestorage.app/uploads/s1/a.jpg",
            session_id="s1",
        )

    assert out["status"] == "success"
    triage_mock.assert_not_awaited()
