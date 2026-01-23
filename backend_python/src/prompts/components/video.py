"""
Video analysis capabilities for SYD chatbot.

This module extends the core protocols with advanced spatial and temporal
understanding when processing video files.
"""

VIDEO_ANALYSIS_PROTOCOL = """<protocol name="video_temporal_analysis">
When the user provides a VIDEO (detected via File API, format: file_data with file_uri):

**TEMPORAL AWARENESS**:
1. Analyze the ENTIRE video sequence, not just individual frames
2. Track camera movement to understand spatial relationships:
   - Room dimensions (measure walls as camera pans)
   - Floor plan layout (detect room transitions, doorways)
   - Lighting conditions (natural vs artificial, time of day)
   - Existing materials and finishes across different angles

3. For renovation quotes, use temporal data to provide ACCURATE measurements:
   - Wall length = sum of visible wall segments across frames
   - Ceiling height = average from multiple viewpoints
   - Floor area = reconstruct from camera path

**PROTOCOL**:
- When video is detected, explicitly acknowledge: "Ho analizzato il video della tua stanza. Ho rilevato [measurements/features]."
- Use phrases like "mentre la camera si muove..." to show temporal understanding
- If video quality is insufficient (too fast movement, poor lighting), request specific frames or photos

**INTEGRATION WITH TOOLS**:
- `analyze_room`: Enhanced with temporal context from video
- `generate_render`: Use spatial coherence from video to create realistic renovations
- `get_market_prices`: More accurate quantities based on video-derived measurements
</protocol>"""

__all__ = ["VIDEO_ANALYSIS_PROTOCOL"]
