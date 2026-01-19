"""
Video-specific Pydantic models for type safety.

These models define the structure for video metadata and triage results.
They ensure strict type synchronization with the frontend TypeScript interfaces.
"""
from pydantic import BaseModel, Field
from typing import Optional


class VideoMetadata(BaseModel):
    """Metadata extracted from video file."""
    duration_seconds: float = Field(..., description="Video duration in seconds")
    format: str = Field(..., description="Video format (e.g., mp4, webm)")
    size_bytes: int = Field(..., description="File size in bytes")
    resolution: Optional[str] = Field(None, description="Video resolution (e.g., 1920x1080)")
    has_audio: bool = Field(True, description="Whether video contains audio track")


class VideoTriageResult(BaseModel):
    """Result structure for video triage analysis.
    
    Extends the standard image triage result with video-specific metadata
    and audio transcription notes.
    """
    success: bool = Field(..., description="Whether analysis was successful")
    roomType: str = Field(..., description="Detected room type")
    currentStyle: str = Field(..., description="Current interior design style")
    keyFeatures: list[str] = Field(..., description="Notable visual features")
    condition: str = Field(..., description="Overall condition rating")
    renovationNotes: str = Field(..., description="Combined notes from visual and audio analysis")
    videoMetadata: Optional[VideoMetadata] = Field(None, description="Video file metadata")
    audioTranscript: Optional[str] = Field(None, description="Transcribed audio from video (if any)")
