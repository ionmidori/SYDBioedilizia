/**
 * Video-specific TypeScript interfaces
 * 
 * These types mirror the Python Pydantic models in src/models/video_types.py
 * for strict type synchronization between backend and frontend.
 */

export interface VideoMetadata {
    duration_seconds: number;
    format: string;  // e.g., "mp4", "webm"
    size_bytes: number;
    resolution?: string;  // e.g., "1920x1080"
    has_audio: boolean;
}

export interface VideoTriageResult {
    success: boolean;
    roomType: string;
    currentStyle: string;
    keyFeatures: string[];
    condition: string;
    renovationNotes: string;
    videoMetadata?: VideoMetadata;
    audioTranscript?: string;
}

/**
 * Client-side video file with validation status
 */
export interface VideoFile {
    file: File;
    url: string;  // Object URL for preview
    duration: number;
    isValid: boolean;
    errorMessage?: string;
}
