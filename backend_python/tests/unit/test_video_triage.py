"""
Unit Tests - Video Triage
==========================
Tests for the video triage/analysis module.
"""
import pytest
import json
import os
from unittest.mock import MagicMock, patch, AsyncMock
from src.vision.video_triage import (
    analyze_video_triage,
    get_video_metadata,
    optimize_video,
    analyze_video_with_gemini
)
from src.models.video_types import VideoMetadata, VideoTriageResult


class TestVideoMetadata:
    """Test video metadata extraction."""
    
    def test_get_video_metadata_success(self, tmp_path):
        """GIVEN a valid video file
        WHEN get_video_metadata is called
        THEN should extract duration, format, and size
        """
        # This test requires FFmpeg to be installed
        # For now, we'll mock the subprocess call
        with patch('subprocess.run') as mock_run:
            mock_run.return_value.stdout = json.dumps({
                "streams": [{
                    "duration": "15.5",
                    "width": 1920,
                    "height": 1080,
                    "codec_name": "h264"
                }],
                "format": {
                    "size": "1024000",
                    "duration": "15.5"
                }
            })
            
            # Create temp file
            video_file = tmp_path / "test.mp4"
            video_file.write_bytes(b"fake video data")
            
            metadata = get_video_metadata(str(video_file))
            
            assert metadata.duration_seconds == 15.5
            assert metadata.resolution == "1920x1080"
            assert metadata.format == "mp4"


class TestVideoOptimization:
    """Test video optimization with FFmpeg."""
    
    def test_optimize_video_rejects_long_duration(self, tmp_path):
        """GIVEN a video longer than 30 seconds
        WHEN optimize_video is called
        THEN should raise ValueError
        """
        video_file = tmp_path / "long_video.mp4"
        video_file.write_bytes(b"fake video data")
        
        with patch('src.vision.video_triage.get_video_metadata') as mock_metadata:
            mock_metadata.return_value = VideoMetadata(
                duration_seconds=35.0,
                format="mp4",
                size_bytes=1024000,
                resolution="1920x1080",
                has_audio=True
            )
            
            with pytest.raises(ValueError, match="exceeds maximum"):
                optimize_video(str(video_file), max_duration=30.0)
    
    def test_optimize_video_creates_optimized_file(self, tmp_path):
        """GIVEN a valid short video
        WHEN optimize_video is called
        THEN should create optimized version
        """
        video_file = tmp_path / "input.mp4"
        video_file.write_bytes(b"fake video data")
        
        with patch('src.vision.video_triage.get_video_metadata') as mock_metadata:
            mock_metadata.return_value = VideoMetadata(
                duration_seconds=10.0,
                format="mp4",
                size_bytes=5000000,
                resolution="1920x1080",
                has_audio=True
            )
            
            with patch('subprocess.run') as mock_ffmpeg:
                # Mock successful FFmpeg execution
                output_file = tmp_path / "optimized.mp4"
                output_file.write_bytes(b"optimized")
                
                # Mock to return our output path
                with patch('tempfile.mkstemp', return_value=(1, str(output_file))):
                    with patch('os.close'):
                        result_path = optimize_video(str(video_file))
                        
                        # Verify FFmpeg was called
                        assert mock_ffmpeg.called
                        # Check that scale filter is applied
                        call_args = mock_ffmpeg.call_args[0][0]
                        assert '-vf' in call_args
                        assert '-r' in call_args  # Framerate reduction


class TestGeminiVideoAnalysis:
    """Test Gemini API video analysis."""
    
    @pytest.mark.asyncio
    async def test_analyze_video_with_gemini_success(self, tmp_path):
        """GIVEN a valid video file
        WHEN analyze_video_with_gemini is called
        THEN should return triage analysis with audio transcript
        """
        video_file = tmp_path / "test.mp4"
        video_file.write_bytes(b"fake video")
        
        # Mock Gemini client
        mock_file = MagicMock()
        mock_file.name = "file123"
        mock_file.uri = "https://generativelanguage.googleapis.com/v1/files/file123"
        mock_file.mime_type = "video/mp4"
        mock_file.state.name = "ACTIVE"
        
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "roomType": "living room",
            "currentStyle": "modern",
            "keyFeatures": ["large windows", "hardwood floor"],
            "condition": "good",
            "audioTranscript": "Voglio cambiare il pavimento",
            "renovationNotes": "User wants to change the floor. Modern living room in good condition."
        })
        
        mock_client = MagicMock()
        mock_client.files.upload.return_value = mock_file
        mock_client.files.get.return_value = mock_file
        mock_client.models.generate_content.return_value = mock_response
        
        with patch('src.vision.video_triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.video_triage.genai.Client', return_value=mock_client):
                result = await analyze_video_with_gemini(str(video_file))
        
        # Assert
        assert result["success"] is True
        assert result["roomType"] == "living room"
        assert result["audioTranscript"] == "Voglio cambiare il pavimento"
        assert "floor" in result["renovationNotes"]
    
    @pytest.mark.asyncio
    async def test_analyze_video_handles_gemini_error(self, tmp_path):
        """GIVEN Gemini API raises exception
        WHEN analyze_video_with_gemini is called
        THEN should return fallback response
        """
        video_file = tmp_path / "test.mp4"
        video_file.write_bytes(b"fake video")
        
        with patch('src.vision.video_triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.video_triage.genai.Client') as mock_client_class:
                mock_client = mock_client_class.return_value
                mock_client.files.upload.side_effect = Exception("API Error")
                
                result = await analyze_video_with_gemini(str(video_file))
        
        assert result["success"] is False
        assert "Unable to perform" in result["renovationNotes"]


class TestVideoTriageEndToEnd:
    """End-to-end tests for video triage."""
    
    @pytest.mark.asyncio
    async def test_analyze_video_triage_complete_flow(self):
        """GIVEN valid video bytes
        WHEN analyze_video_triage is called
        THEN should return VideoTriageResult with all fields
        """
        video_bytes = b"fake video data"
        
        # Mock all dependencies
        with patch('src.vision.video_triage.get_video_metadata') as mock_metadata:
            mock_metadata.return_value = VideoMetadata(
                duration_seconds=15.0,
                format="mp4",
                size_bytes=len(video_bytes),
                resolution="1920x1080",
                has_audio=True
            )
            
            with patch('src.vision.video_triage.optimize_video') as mock_optimize:
                mock_optimize.return_value = "/tmp/optimized.mp4"
                
                with patch('src.vision.video_triage.analyze_video_with_gemini') as mock_analyze:
                    mock_analyze.return_value = {
                        "success": True,
                        "roomType": "bedroom",
                        "currentStyle": "contemporary",
                        "keyFeatures": ["bed", "wardrobe"],
                        "condition": "excellent",
                        "renovationNotes": "Nice room",
                        "audioTranscript": "Test audio"
                    }
                    
                    result = await analyze_video_triage(video_bytes)
        
        # Assert
        assert isinstance(result, VideoTriageResult)
        assert result.success is True
        assert result.roomType == "bedroom"
        assert result.videoMetadata is not None
        assert result.videoMetadata.duration_seconds == 15.0
        assert result.audioTranscript == "Test audio"
