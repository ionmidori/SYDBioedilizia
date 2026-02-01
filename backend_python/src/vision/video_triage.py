
"""
Video Triage Analysis Module

Handles video upload, preprocessing (FFmpeg optimization), and multimodal analysis
using Gemini 3 Flash for both visual and audio content.
"""
import os
import logging
import tempfile
import asyncio
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional
from google import genai
from google.genai import types
from src.models.video_types import VideoMetadata, VideoTriageResult
from src.utils.json_parser import extract_json_response

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Video Triage Prompt - Multimodal (Visual + Audio)
VIDEO_TRIAGE_PROMPT = """You are an expert interior architect analyzing this renovation video.

**CRITICAL INSTRUCTIONS:**
1. Watch the entire video natively to understand the space layout and user intent.
2. If you need to analyze SPECIFIC DETAILS (e.g., read text, count fixtures, measure proportions), 
   USE PYTHON CODE to extract and analyze ONLY the relevant frames. DO NOT process the entire video.
3. Combine visual observations with audio transcription.

**ANALISI VISIVA:**
1. TIPO STANZA: Che tipo di stanza è? (es. cucina, soggiorno, camera da letto)
2. STILE ATTUALE: Qual è lo stile di design attuale? (es. moderno, tradizionale, industriale)
3. CARATTERISTICHE CHIAVE: Elenca 3-5 elementi strutturali o di design notevoli (POSIZIONI PRECISE)
4. CONDIZIONI: Valuta le condizioni complessive (eccellente/buono/discreto/scarso)

**ANALISI AUDIO (se presente):**
5. TRASCRIZIONE: Trascrivi eventuali richieste o commenti dell'utente nel video
6. INTENTI: Identifica desideri di ristrutturazione o problemi menzionati

**INTEGRAZIONE:**
Combina le informazioni visive e vocali nel campo "renovationNotes". Se l'utente ha specificato richieste particolari (es. "voglio cambiare il pavimento"), includile esplicitamente.

**IMPORTANT**: After reasoning/verification, output your final answer ONLY inside a ```json code block:

```json
{
  "roomType": "...",
  "currentStyle": "...",
  "keyFeatures": ["...", "...", "..."],
  "condition": "...",
  "audioTranscript": "... (se audio presente, altrimenti null)",
  "renovationNotes": "... (combina analisi visiva + richieste audio)"
}
```
"""


def get_video_metadata(video_path: str) -> VideoMetadata:
    """
    Extract video metadata using FFprobe.
    
    Args:
        video_path: Path to video file
        
    Returns:
        VideoMetadata object with duration, format, size, resolution
    """
    try:
        # Use ffprobe to get video info
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-select_streams', 'v:0',
            '-show_entries', 'stream=duration,width,height,codec_name',
            '-show_entries', 'format=size',
            '-of', 'json',
            video_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        import json
        data = json.loads(result.stdout)
        
        # Extract metadata
        stream = data.get('streams', [{}])[0]
        format_info = data.get('format', {})
        
        duration = float(stream.get('duration', 0) or format_info.get('duration', 0))
        width = stream.get('width', 0)
        height = stream.get('height', 0)
        resolution = f"{width}x{height}" if width and height else None
        size_bytes = int(format_info.get('size', 0))
        format_name = Path(video_path).suffix.lstrip('.')
        
        # Check if video has audio track
        audio_cmd = ['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_type', '-of', 'json', video_path]
        audio_result = subprocess.run(audio_cmd, capture_output=True, text=True)
        has_audio = len(json.loads(audio_result.stdout).get('streams', [])) > 0
        
        return VideoMetadata(
            duration_seconds=duration,
            format=format_name,
            size_bytes=size_bytes,
            resolution=resolution,
            has_audio=has_audio
        )
        
    except Exception as e:
        logger.error(f"Failed to extract video metadata: {str(e)}")
        # Return minimal metadata
        size_bytes = os.path.getsize(video_path) if os.path.exists(video_path) else 0
        return VideoMetadata(
            duration_seconds=0,
            format=Path(video_path).suffix.lstrip('.'),
            size_bytes=size_bytes,
            resolution=None,
            has_audio=True  # Assume true by default
        )


def optimize_video(input_path: str, max_duration: float = 30.0, trim_start: Optional[float] = None, trim_end: Optional[float] = None) -> str:
    """
    Optimize video for Gemini analysis using FFmpeg.
    
    - Validates duration (<= max_duration seconds)
    - Reduces resolution to max 720p
    - Reduces framerate to 5fps (sufficient for triage)
    - Maintains audio track for transcription
    - APPLES TRIM if trim_start/trim_end provided
    
    Args:
        input_path: Path to original video
        max_duration: Maximum allowed duration in seconds
        trim_start: Start time in seconds
        trim_end: End time in seconds
        
    Returns:
        Path to optimized video file
        
    Raises:
        ValueError: If video exceeds max_duration (and no trim applied)
    """
    logger.info(f"Optimizing video: {input_path} (Trim: {trim_start}-{trim_end})")
    
    # Get metadata first
    metadata = get_video_metadata(input_path)
    
    # Calculate effective duration
    if trim_start is not None and trim_end is not None:
        duration = trim_end - trim_start
    else:
        duration = metadata.duration_seconds

    # Validate duration
    if duration > max_duration + 1.0: # Add 1s tolerance
        raise ValueError(f"Video duration ({duration:.1f}s) exceeds maximum ({max_duration}s). Please trim the video.")
    
    # Create temporary output file
    output_fd, output_path = tempfile.mkstemp(suffix='.mp4', prefix='optimized_video_')
    os.close(output_fd)
    
    try:
        # FFmpeg optimization command
        # -vf scale: resize to max 720p height while preserving aspect ratio
        # -r 5: reduce to 5 fps
        # -c:a copy: keep audio track as-is
        cmd = ['ffmpeg', '-i', input_path]
        
        # Apply Trim
        if trim_start is not None:
            cmd.extend(['-ss', str(trim_start)])
        if trim_end is not None:
             cmd.extend(['-to', str(trim_end)])
             
        cmd.extend([
            '-vf', 'scale=-2:min(ih\\,720)',  # Max height 720px, preserve aspect ratio
            '-r', '5',  # 5 fps
            '-c:v', 'libx264',  # Re-encode video
            '-preset', 'fast',
            '-crf', '28',  # Compression quality (higher = more compressed)
            '-c:a', 'aac',  # Re-encode audio for compatibility
            '-b:a', '64k',  # Reduce audio bitrate
            '-y',  # Overwrite output
            output_path
        ])
        
        subprocess.run(cmd, check=True, capture_output=True)
        logger.info(f"Video optimized successfully: {output_path}")
        
        # Log size reduction
        original_size = os.path.getsize(input_path)
        optimized_size = os.path.getsize(output_path)
        reduction = ((original_size - optimized_size) / original_size) * 100
        logger.info(f"Size reduction: {reduction:.1f}% ({original_size} -> {optimized_size} bytes)")
        
        return output_path
        
    except subprocess.CalledProcessError as e:
        logger.error(f"FFmpeg optimization failed: {e.stderr.decode() if e.stderr else str(e)}")
        os.unlink(output_path)
        raise Exception(f"Video optimization failed: {str(e)}")
    except Exception as e:
        if os.path.exists(output_path):
            os.unlink(output_path)
        raise


    """
    Analyze video using Gemini 3 Flash multimodal capabilities.
    
    Processes both visual content and audio transcription.
    
    Args:
        video_path: Path to video file (should be optimized already)
        
    Returns:
        Dict with triage analysis results
    """
    if not GEMINI_API_KEY:
        raise Exception("GEMINI_API_KEY not configured")
    
    client = genai.Client(api_key=GEMINI_API_KEY)
    
    try:
        logger.info("Uploading video to Gemini File API...")
        
        # Upload video file to Gemini (Async)
        # client.aio.files.upload accepts path
        video_file = await client.aio.files.upload(path=video_path)
        
        # Wait for processing
        logger.info(f"Waiting for video to be processed (file: {video_file.name})...")
        max_wait = 60  # Max 60 seconds wait
        elapsed = 0
        while video_file.state.name == "PROCESSING" and elapsed < max_wait:
            await asyncio.sleep(2)
            video_file = await client.aio.files.get(name=video_file.name)
            elapsed += 2
        
        if video_file.state.name != "ACTIVE":
            raise Exception(f"Video processing failed. State: {video_file.state.name}")
        
        logger.info("Video ready. Performing multimodal analysis (visual + audio)...")
        
        # Generate content using video + prompt
        response = await client.aio.models.generate_content(
            model="gemini-3-flash-preview",
            contents=[
                types.Content(
                    parts=[
                        types.Part(text=VIDEO_TRIAGE_PROMPT),
                        types.Part(file_data=types.FileData(
                            file_uri=video_file.uri,
                            mime_type=video_file.mime_type
                        ))
                    ]
                )
            ],
            config=types.GenerateContentConfig(
                tools=[types.Tool(code_execution=types.CodeExecution())]
            )
        )
        
        # Clean up uploaded file
        try:
            await client.aio.files.delete(name=video_file.name)
        except Exception:
            pass  # Non-critical
        
        if not response.text:
            raise Exception("No response from Gemini vision model")
        
        # Parse JSON response using robust extractor (handles CoT + Code)
        analysis = extract_json_response(response.text)
        
        if not analysis:
            raise Exception("Failed to extract valid JSON from model response")
        
        logger.info(f"Video analysis complete: {analysis.get('roomType', 'unknown')} room detected")
        
        return {
            "success": True,
            "roomType": analysis.get("roomType", "unknown"),
            "currentStyle": analysis.get("currentStyle", "contemporary"),
            "keyFeatures": analysis.get("keyFeatures", []),
            "condition": analysis.get("condition", "good"),
            "renovationNotes": analysis.get("renovationNotes", ""),
            "audioTranscript": analysis.get("audioTranscript")
        }
        
    except Exception as e:
        logger.error(f"Video analysis failed: {str(e)}", exc_info=True)
        # Fallback response
        return {
            "success": False,
            "roomType": "living space",
            "currentStyle": "contemporary",
            "keyFeatures": ["existing layout"],
            "condition": "good",
            "renovationNotes": f"Unable to perform detailed video analysis: {str(e)}",
            "audioTranscript": None
        }
    finally:
        client.close()


async def analyze_video_triage(video_data: bytes, metadata: Optional[Dict[str, Any]] = None) -> VideoTriageResult:
    """
    Main entry point for video triage analysis.
    
    Args:
        video_data: Raw video file bytes
        metadata: Optional metadata (e.g. trimRange from frontend)
        
    Returns:
        VideoTriageResult with complete analysis
    """
    temp_input = None
    temp_optimized = None
    
    trim_start = None
    trim_end = None
    
    # Extract trim settings if available
    if metadata and "trimRange" in metadata:
        try:
            trim_range = metadata["trimRange"]
            trim_start = float(trim_range.get("start", 0))
            trim_end = float(trim_range.get("end", 0))
            logger.info(f"Received trim metadata: {trim_start}s - {trim_end}s")
        except (ValueError, TypeError) as e:
            logger.warning(f"Invalid trim metadata: {e}")
            
    try:
        # Save video to temporary file
        temp_fd, temp_input = tempfile.mkstemp(suffix='.mp4', prefix='input_video_')
        os.close(temp_fd)
        
        with open(temp_input, 'wb') as f:
            f.write(video_data)
        
        # Get metadata before optimization
        vid_meta = get_video_metadata(temp_input)
        logger.info(f"Video metadata: {vid_meta.duration_seconds}s, {vid_meta.format}, {vid_meta.size_bytes} bytes")
        
        # Optimize video (with optional trim)
        temp_optimized = optimize_video(
            temp_input, 
            max_duration=30.0,
            trim_start=trim_start,
            trim_end=trim_end
        )
        
        # Analyze with Gemini
        analysis = await analyze_video_with_gemini(temp_optimized)
        
        # Build final result
        return VideoTriageResult(
            **analysis,
            videoMetadata=vid_meta
        )
        
    finally:
        # Cleanup temporary files
        for path in [temp_input, temp_optimized]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except:
                    pass
