import base64
import json
import logging
import io
import ezdxf
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
from google import genai
from google.genai import types as genai_types
from src.core.config import settings

logger = logging.getLogger(__name__)

# --- 1. MODELLI DATI (Struttura Vettoriale) ---

class CadPoint(BaseModel):
    x: int
    y: int

class CadWall(BaseModel):
    id: str
    start: CadPoint
    end: CadPoint
    thickness_pixels: int = 10

class CadOpening(BaseModel):
    type: str = Field(..., description="'door' or 'window'")
    wall_id: str
    position_pixels: CadPoint
    width_pixels: int

class ScaleReference(BaseModel):
    description: str
    pixel_width: float
    real_width_cm: float

class CadVectorData(BaseModel):
    """Output strutturato dall'analisi AI della planimetria"""
    scale_reference: Optional[ScaleReference] = None
    walls: List[CadWall]
    openings: List[CadOpening]

# --- 2. LOGICA VISION (Gemini) ---

async def analyze_floorplan_vector(image_bytes: bytes) -> CadVectorData:
    """
    Usa Gemini Vision per estrarre vettori (muri, porte) da un'immagine raster.
    """
    model_name = "gemini-2.5-flash"
    logger.info(f"[CadEngine] Starting vector analysis with {model_name}...")

    system_prompt = """
    ROLE: You are an Expert CAD Digitizer.
    TASK: Analyze the floorplan image and extract vector coordinates to reconstruct it digitally.

    OUTPUT FORMAT: Return ONLY a valid JSON object matching this schema:
    {
      "scale_reference": {
        "description": "identified object for scale (e.g. standard door entry)",
        "pixel_width": <float>,
        "real_width_cm": <float>
      },
      "walls": [
        { "id": "w1", "start": {"x": 100, "y": 100}, "end": {"x": 500, "y": 100}, "thickness_pixels": 15 }
      ],
      "openings": [
        { "type": "door", "wall_id": "w1", "position_pixels": {"x": 150, "y": 100}, "width_pixels": 40 },
        { "type": "window", "wall_id": "w1", "position_pixels": {"x": 300, "y": 100}, "width_pixels": 60 }
      ]
    }

    RULES:
    1. COORDINATE SYSTEM: Image pixel coordinates. Top-left is [0,0].
    2. WALLS: Detect structural walls. Ignore furniture. Connect corners precisely.
    3. SCALE: Identify a standard element (e.g. entry door = 90cm) to establish scale.
    """

    try:
        client = genai.Client(api_key=settings.api_key)
        base64_image = base64.b64encode(image_bytes).decode('utf-8')

        response = await client.aio.models.generate_content(
            model=model_name,
            contents=[genai_types.Content(parts=[
                genai_types.Part(text=system_prompt),
                genai_types.Part(inline_data=genai_types.Blob(
                    mime_type="image/jpeg",
                    data=base64_image,
                )),
            ])],
            config=genai_types.GenerateContentConfig(temperature=0.1),
        )

        raw_output = (response.text or "").replace("```json", "").replace("```", "").strip()
        parsed = json.loads(raw_output)
        vector_data = CadVectorData(**parsed)

        logger.info(f"[CadEngine] Extracted {len(vector_data.walls)} walls and {len(vector_data.openings)} openings.")
        return vector_data

    except Exception as e:
        logger.error(f"[CadEngine] Analysis failed: {e}")
        raise ValueError(f"Failed to analyze floorplan: {e}")

# --- 3. GENERAZIONE DXF (ezdxf) ---

def generate_dxf_bytes(vector_data: CadVectorData) -> bytes:
    """
    Converte i dati vettoriali JSON in un file DXF binario valido.
    """
    try:
        doc = ezdxf.new('R2010')
        msp = doc.modelspace()

        scale_factor = 0.01
        if vector_data.scale_reference and vector_data.scale_reference.pixel_width > 0:
            cm_per_pixel = vector_data.scale_reference.real_width_cm / vector_data.scale_reference.pixel_width
            scale_factor = cm_per_pixel / 100.0

        logger.info(f"[CadEngine] Generating DXF with scale factor: {scale_factor} (1px = {scale_factor:.4f}m)")

        doc.layers.new(name='WALLS', dxfattribs={'color': 7, 'lineweight': 35})
        doc.layers.new(name='OPENINGS', dxfattribs={'color': 3})
        doc.layers.new(name='ANNOTATIONS', dxfattribs={'color': 1})

        for wall in vector_data.walls:
            start = (wall.start.x * scale_factor, -wall.start.y * scale_factor)
            end = (wall.end.x * scale_factor, -wall.end.y * scale_factor)
            msp.add_line(start, end, dxfattribs={'layer': 'WALLS'})

        for opening in vector_data.openings:
            pos = (opening.position_pixels.x * scale_factor, -opening.position_pixels.y * scale_factor)
            width = opening.width_pixels * scale_factor
            if opening.type == 'door':
                msp.add_circle(pos, radius=width, dxfattribs={'layer': 'OPENINGS'})
            else:
                msp.add_line(
                    (pos[0] - width / 2, pos[1]),
                    (pos[0] + width / 2, pos[1]),
                    dxfattribs={'layer': 'OPENINGS'}
                )

        output = io.StringIO()
        doc.write(output)
        return output.getvalue().encode('utf-8')

    except Exception as e:
        logger.error(f"[CadEngine] DXF Generation failed: {e}")
        raise ValueError(f"Failed to generate DXF: {e}")
