"""
RoomMeasurementAgent: Agentic vision module for room measurement.

Uses Gemini 2.5 Flash with Python code execution to analyze a room photo and
produce structured measurements (floor_mq, walls_mq, perimeter_ml, etc.) for
direct use in BOQ (Bill of Quantities) generation.

Pattern: Skill prompt-engineering — CoT + code execution + few-shot + self-correction.
CRITICAL: Output feeds directly into InsightEngine SKU quantity estimation.
"""
import logging

from google import genai
from google.genai import types
from pydantic import BaseModel, Field

from src.core.config import settings
from src.utils.json_parser import extract_json_response

logger = logging.getLogger(__name__)


# ── Domain Exception ───────────────────────────────────────────────────────────

class MeasurementError(Exception):
    """Raised when room measurement analysis cannot produce a result."""


# ── Domain Models ─────────────────────────────────────────────────────────────

class SurfaceWork(BaseModel):
    """Measurements and renovation scope for a single surface."""
    model_config = {"extra": "forbid"}
    surface: str = Field(..., description="floor | walls | ceiling | single_wall_N/S/E/W")
    estimated_mq: float = Field(..., ge=0.0, description="Estimated area in square meters")
    material_current: str = Field(..., description="Current material (ceramica, intonaco, parquet...)")
    condition: str = Field(..., description="excellent | good | fair | poor")
    needs_demolition: bool = Field(False, description="True if existing material must be removed")
    work_description: str = Field(..., description="Concise Italian description of the work needed")


class RoomMeasurements(BaseModel):
    """
    Structured output from RoomMeasurementAgent.
    All mq values are GROSS areas (+5% scrap factor already applied where noted).
    """
    model_config = {"extra": "forbid"}
    room_type: str = Field(..., description="bagno | cucina | soggiorno | camera | altro")
    estimated_floor_mq: float = Field(..., ge=0.0, description="Floor area in mq")
    estimated_walls_mq: float = Field(..., ge=0.0, description="Total wall area minus openings, in mq")
    estimated_ceiling_mq: float = Field(..., ge=0.0, description="Ceiling area in mq (≈ floor_mq)")
    estimated_perimeter_ml: float = Field(..., ge=0.0, description="Room perimeter in linear meters")
    estimated_height_m: float = Field(default=2.7, ge=2.0, le=5.0, description="Estimated ceiling height")
    surfaces: list[SurfaceWork] = Field(default_factory=list)
    scale_reference: str = Field(
        default="",
        description="Object used as scale reference (e.g. 'porta standard 210cm', 'piastrella 30x30cm')"
    )
    confidence_score: float = Field(
        default=0.5, ge=0.0, le=1.0,
        description="0.0-1.0 — 1.0 = reference object found; 0.5 = estimated from standard proportions"
    )
    measurement_notes: str = Field(
        default="",
        description="How measurements were derived (perspective geometry, reference objects, defaults)"
    )


# ── Prompt ────────────────────────────────────────────────────────────────────

_MEASURE_PROMPT = """\
Sei un Geometra AI specializzato in analisi fotogrammetrica di ambienti residenziali.
Il tuo compito è analizzare la foto e MISURARE le superfici da ristrutturare.

## METODO DI ANALISI (Chain-of-Thought con Python)

**STEP 1 — IDENTIFICAZIONE OGGETTI DI RIFERIMENTO**
Cerca nella foto oggetti con dimensioni standard italiane:
- Porta interna: larghezza 80–90 cm, altezza 210 cm
- Porta finestra: altezza 210–240 cm
- Piastrella 30x30 cm, 60x60 cm (conta le fughe visibili per verificare)
- Radiatore standard: altezza 60 cm
- Interruttore elettrico: 8x8 cm
- Sanitari (WC): larghezza ≈ 36 cm, profondità ≈ 65 cm
- Lavandino bagno: larghezza ≈ 50–60 cm

Scegli UN oggetto di riferimento visibile e misura la sua altezza/larghezza in pixel.

**STEP 2 — CALCOLO SCALA con Python**
Scrivi ed esegui codice Python per:
1. Stimare il rapporto pixel/cm dall'oggetto di riferimento
2. Applicare la geometria prospettica per stimare larghezza × profondità del pavimento
3. Calcolare il perimetro e le superfici murarie (h standard 2.7m se non misurabile)

```python
# Esempio di ragionamento geometrico
# ref_height_px = altezza porta in pixel
# ref_height_cm = 210  # porta standard
# px_per_cm = ref_height_px / ref_height_cm
# floor_width_cm = floor_width_px / px_per_cm
# floor_depth_cm = floor_depth_px / px_per_cm  # prospettica
# floor_mq = (floor_width_cm * floor_depth_cm) / 10000
```

Se non riesci a misurare con un riferimento, usa le medie italiane per tipo stanza:
- Bagno: 4–7 mq, altezza 2.4–2.7m
- Cucina: 10–14 mq, altezza 2.7m
- Camera: 12–16 mq, altezza 2.7m
- Soggiorno: 18–28 mq, altezza 2.7m
In questo caso imposta confidence_score = 0.4

**STEP 3 — ANALISI CONDIZIONI PER SUPERFICIE**
Per ogni superficie visibile, valuta:
- Materiale attuale (ceramica, parquet, intonaco, carta da parati, gres...)
- Condizione (excellent/good/fair/poor)
- Se servono demolizioni prima dei lavori

**STEP 4 — CALCOLO SUPERFICI NETTE**
- Pareti nette = perimetro × altezza − aperture (ogni porta ≈ 2.0mq, finestra ≈ 1.4mq)
- Aggiungi +5% di scarto su tutte le superfici

## FEW-SHOT EXAMPLES

**Esempio 1 — Bagno**
Oggetto riferimento: WC standard larghezza 36cm visibile.
Stima: stanza 2.3m × 2.8m = 6.4mq pavimento, h=2.4m
→ floor_mq: 6.7 (con +5%), walls_mq: 22.1 (perimetro 10.2m × 2.4h − 2 porte ≈ 4.0mq)

**Esempio 2 — Soggiorno**
Oggetto riferimento: porta 80cm larghezza visibile.
Stima: stanza 4.5m × 5.0m = 22.5mq, h=2.7m
→ floor_mq: 23.6 (con +5%), walls_mq: 51.8 (perimetro 19.0m × 2.7h − 3 aperture ≈ 4.5mq)

## OUTPUT RICHIESTO

Dopo il ragionamento, restituisci SOLO un blocco ```json con questo schema:

```json
{{
  "room_type": "bagno",
  "estimated_floor_mq": 6.7,
  "estimated_walls_mq": 22.1,
  "estimated_ceiling_mq": 6.4,
  "estimated_perimeter_ml": 10.2,
  "estimated_height_m": 2.4,
  "surfaces": [
    {{
      "surface": "floor",
      "estimated_mq": 6.7,
      "material_current": "gres beige anni 90",
      "condition": "fair",
      "needs_demolition": true,
      "work_description": "Rimozione gres esistente e posa nuovo pavimento"
    }},
    {{
      "surface": "walls",
      "estimated_mq": 22.1,
      "material_current": "piastrelle bianche h=150cm",
      "condition": "poor",
      "needs_demolition": true,
      "work_description": "Demolizione rivestimento parziale e rifacimento fino a soffitto"
    }}
  ],
  "scale_reference": "WC standard larghezza 36cm",
  "confidence_score": 0.75,
  "measurement_notes": "Scala calcolata dal WC visibile. Prospettica applicata per stimare profondità."
}}
```

RICORDA: Misura SOLO superfici fisiche della stanza. NON includere mobili o arredi nelle misure.
"""


# ── Agent ─────────────────────────────────────────────────────────────────────

async def measure_room_from_photo(
    image_bytes: bytes,
    mime_type: str = "image/jpeg",
) -> RoomMeasurements:
    """
    Analyzes a room photo using Gemini 2.5 Flash with Python code execution
    to estimate surface measurements for BOQ generation.

    Uses:
    - Native Gemini multimodal vision for visual analysis
    - Python code execution for geometric calculations
    - Reference object detection for scale calibration

    Args:
        image_bytes: Raw image bytes (JPEG/PNG).
        mime_type: MIME type of the image.

    Returns:
        RoomMeasurements with floor_mq, walls_mq, per-surface conditions, and confidence score.

    Raises:
        Exception: If Gemini call fails. Callers should catch and fall back to defaults.
    """
    logger.info("[MeasureRoom] Starting agentic room measurement analysis...")

    client = genai.Client(api_key=settings.api_key)

    try:
        response = await client.aio.models.generate_content(
            model="gemini-3.1-flash-lite-preview",
            contents=[
                types.Content(parts=[
                    types.Part(text=_MEASURE_PROMPT),
                    types.Part(inline_data=types.Blob(mime_type=mime_type, data=image_bytes)),
                ])
            ],
            config=types.GenerateContentConfig(
                tools=[{"code_execution": {}}],
                temperature=0.1,
            ),
        )
    finally:
        client.close()

    if not response.text:
        raise MeasurementError("Empty response from Gemini.")

    raw = extract_json_response(response.text)
    if not raw:
        raise MeasurementError("Could not extract JSON from Gemini response.")

    result = RoomMeasurements.model_validate(raw)

    logger.info(
        "[MeasureRoom] Measurement complete.",
        extra={
            "room_type": result.room_type,
            "floor_mq": result.estimated_floor_mq,
            "walls_mq": result.estimated_walls_mq,
            "confidence": result.confidence_score,
            "scale_ref": result.scale_reference,
        },
    )
    return result


def format_measurements_for_insight(measurements: RoomMeasurements) -> str:
    """
    Formats RoomMeasurements as a structured text block for injection
    into the InsightEngine system prompt context.

    This replaces the Italian average defaults with vision-derived actuals,
    giving the InsightEngine precise quantities instead of estimates.
    """
    lines = [
        "\n\n## Misure Stanza (Agentic Vision — Gemini 2.5 Flash + Code Execution)",
        f"**Tipo stanza**: {measurements.room_type}",
        f"**Pavimento**: {measurements.estimated_floor_mq:.1f} mq",
        f"**Pareti totali nette**: {measurements.estimated_walls_mq:.1f} mq",
        f"**Soffitto**: {measurements.estimated_ceiling_mq:.1f} mq",
        f"**Perimetro**: {measurements.estimated_perimeter_ml:.1f} ml",
        f"**Altezza stimata**: {measurements.estimated_height_m:.1f} m",
        f"**Confidenza misura**: {measurements.confidence_score:.0%}"
        + (f" (ref: {measurements.scale_reference})" if measurements.scale_reference else ""),
        "",
        "**Condizioni per superficie**:",
    ]
    for s in measurements.surfaces:
        demo_flag = " [DEMOLIZIONE RICHIESTA]" if s.needs_demolition else ""
        lines.append(
            f"  • {s.surface}: {s.estimated_mq:.1f}mq | {s.material_current}"
            f" | condizione: {s.condition}{demo_flag}"
        )
        lines.append(f"    → {s.work_description}")

    lines += [
        "",
        "**Note misura**: " + (measurements.measurement_notes or "Medie italiane standard applicate."),
        "",
        "USA QUESTE MISURE come quantità base per gli SKU di pavimentazione, rivestimento e tinteggiatura.",
        "Non usare le medie italiane di default — hai dati reali dalla foto.",
    ]
    return "\n".join(lines)
