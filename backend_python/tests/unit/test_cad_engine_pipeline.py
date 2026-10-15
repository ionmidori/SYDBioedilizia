"""CAD pipeline: Gemini vision JSON -> CadVectorData -> DXF (R2010).

Replaces ``test_generate_cad_route.py``, which exercised the pipeline through
the dev-only ``/api/test/tools/generate-cad`` route (removed with TestSprite).
The "Bug D" regression it pinned — the route imported a ``CADEngine`` class
that does not exist — is now covered at the source: the real public API
``analyze_floorplan_vector`` -> ``generate_dxf_bytes`` is driven end to end
with a mocked genai client, and the DXF is parsed back with ezdxf.
"""
from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from ezdxf.filemanagement import read as ezdxf_read
from src.vision import cad_engine
from src.vision.cad_engine import (
    CadOpening,
    CadPoint,
    CadVectorData,
    CadWall,
    ScaleReference,
    analyze_floorplan_vector,
    generate_dxf_bytes,
)


def _fake_client(text: str) -> MagicMock:
    response = MagicMock()
    response.text = text
    client = MagicMock()
    client.aio.models.generate_content = AsyncMock(return_value=response)
    return client


def _entities(dxf: bytes, layer: str) -> list:
    doc = ezdxf_read(io.StringIO(dxf.decode("utf-8")))
    return [e for e in doc.modelspace() if e.dxf.layer == layer]


async def test_pipeline_produces_dxf_from_vision_json() -> None:
    vision_json = {
        "walls": [{"id": "w1", "start": {"x": 0, "y": 0}, "end": {"x": 500, "y": 0}, "thickness_pixels": 15}],
        "openings": [],
    }
    # Gemini often wraps JSON in a markdown fence: the parser must strip it.
    fenced = f"```json\n{json.dumps(vision_json)}\n```"

    with patch.object(cad_engine, "get_genai_client", return_value=_fake_client(fenced)):
        # JPEG magic: the engine labels the Blob image/jpeg (see PR note on CAD).
        vectors = await analyze_floorplan_vector(b"\xff\xd8\xff\xe0-fake-jpeg")

    dxf = generate_dxf_bytes(vectors)

    assert b"SECTION" in dxf
    walls = _entities(dxf, "WALLS")
    assert len(walls) == 1
    assert walls[0].dxftype() == "LINE"


async def test_invalid_vision_output_raises_value_error() -> None:
    with patch.object(cad_engine, "get_genai_client", return_value=_fake_client("not json")):
        with pytest.raises(ValueError, match="Failed to analyze floorplan"):
            await analyze_floorplan_vector(b"img")


def test_default_scale_is_one_centimetre_per_pixel() -> None:
    vectors = CadVectorData(
        walls=[CadWall(id="w1", start=CadPoint(x=100, y=200), end=CadPoint(x=600, y=200))],
        openings=[],
    )
    (line,) = _entities(generate_dxf_bytes(vectors), "WALLS")

    # 1 px = 0.01 m; the y axis is flipped (image top-left origin -> CAD bottom-left).
    assert line.dxf.start.x == pytest.approx(1.0)
    assert line.dxf.start.y == pytest.approx(-2.0)
    assert line.dxf.end.x == pytest.approx(6.0)


def test_scale_reference_sets_metres_per_pixel() -> None:
    # A 90 cm door measured as 45 px -> 2 cm per px -> 0.02 m per px.
    vectors = CadVectorData(
        scale_reference=ScaleReference(description="door", pixel_width=45, real_width_cm=90),
        walls=[CadWall(id="w1", start=CadPoint(x=0, y=0), end=CadPoint(x=100, y=0))],
        openings=[],
    )
    (line,) = _entities(generate_dxf_bytes(vectors), "WALLS")

    assert line.dxf.end.x == pytest.approx(2.0)


def test_openings_drawn_on_openings_layer() -> None:
    vectors = CadVectorData(
        walls=[CadWall(id="w1", start=CadPoint(x=0, y=0), end=CadPoint(x=500, y=0))],
        openings=[
            CadOpening(type="door", wall_id="w1", position_pixels=CadPoint(x=150, y=0), width_pixels=40),
            CadOpening(type="window", wall_id="w1", position_pixels=CadPoint(x=300, y=0), width_pixels=60),
        ],
    )
    openings = _entities(generate_dxf_bytes(vectors), "OPENINGS")

    kinds = sorted(e.dxftype() for e in openings)
    assert kinds == ["CIRCLE", "LINE"]
    door = next(e for e in openings if e.dxftype() == "CIRCLE")
    assert door.dxf.radius == pytest.approx(0.4)
