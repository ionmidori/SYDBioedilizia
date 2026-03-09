"""
Video analysis capabilities for SYD chatbot.

This module extends the core protocols with advanced spatial and temporal
understanding when processing video files.
"""

VIDEO_ANALYSIS_PROTOCOL = """<protocol name="video_temporal_analysis">
When the user provides a VIDEO (detected via File API, format: file_data with file_uri):

Video analysis is NATIVE — no tool call needed. Apply the same 4-category structured template
as for photos (Superfici / Impianti / Infissi / Criticità), with these video-specific advantages:

**TEMPORAL ADVANTAGES over single photo**:
- Superfici: Confirm materials across multiple angles — e.g., verify floor material is consistent, detect hidden damage not visible from one angle.
- m² estimates: Significantly more accurate. Use the camera pan to track wall lengths across frames.
  - Wall length = sum of visible segments as camera sweeps
  - Ceiling height = average from multiple viewpoints (look for door tops as 210cm reference)
  - Floor area = reconstruct from camera trajectory + reference objects
- Impianti: More complete picture — you may see elements hidden in a single photo (boiler, electrical panel, underfloor heating pipes).
- Criticità: Detect issues on multiple walls/surfaces — damp patches, cracks may appear on walls not visible in a single frame.
- Infissi: Count all windows and doors across the full tour.

**IF VIDEO QUALITY IS INSUFFICIENT** (too fast movement, poor lighting, extreme blur):
- Request specific frames or a new slow-pan video before completing the assessment.

**USER-FACING OUTPUT** (same structure as photo, but reference video context):
"Ho analizzato il video della tua stanza. Vedo [tipo stanza] con [2-3 elementi chiave]. [1 frase criticità se presente]. Come vuoi procedere?

1. 🎨 **Visualizzare** idee con un rendering 3D
2. 📋 **Ricevere un preventivo** dettagliato

Dimmi 1 o 2."

**INTEGRATION WITH TOOLS**:
- `generate_render`: Build a richer prompt using multi-angle spatial coherence (room layout, all visible surfaces, lighting from video).
- `get_market_prices`: Use video-derived m² estimates for more accurate quantity queries than single-photo estimates.
</protocol>"""

__all__ = ["VIDEO_ANALYSIS_PROTOCOL"]
