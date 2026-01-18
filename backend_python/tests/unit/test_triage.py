"""
Unit Tests - Image Triage
==========================
Tests for the image triage/analysis module.
"""
import pytest
import json
from unittest.mock import MagicMock, patch
from src.vision.triage import analyze_image_triage


class TestImageTriage:
    """Test image triage analysis functionality."""
    
    @pytest.mark.asyncio
    async def test_successful_analysis(
        self,
        mock_env_development,
        sample_image_bytes
    ):
        """GIVEN valid image bytes
        WHEN analyze_image_triage is called
        THEN should return analysis with room type and features
        """
        # Arrange: Mock Gemini Client response
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "roomType": "living room",
            "currentStyle": "modern",
            "keyFeatures": ["large windows", "hardwood floor", "pendant lights"],
            "condition": "excellent",
            "renovationNotes": "Well-maintained space"
        })
        
        mock_models = MagicMock()
        mock_models.generate_content.return_value = mock_response
        
        mock_client = MagicMock()
        mock_client.models = mock_models
        
        # Patch both the Client and the module-level API key constant
        with patch('src.vision.triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.triage.genai.Client', return_value=mock_client):
                # Act
                result = await analyze_image_triage(sample_image_bytes)
        
        # Assert
        assert result["success"] is True
        assert result["roomType"] == "living room"
        assert result["currentStyle"] == "modern"
        assert isinstance(result["keyFeatures"], list)
        assert len(result["keyFeatures"]) == 3
        assert result["condition"] == "excellent"
    
    @pytest.mark.asyncio
    async def test_handles_json_with_code_fences(
        self,
        mock_env_development,
        sample_image_bytes
    ):
        """GIVEN response with JSON wrapped in code fences
        WHEN analyze_image_triage is called
        THEN should strip fences and parse correctly
        """
        # Arrange: Mock response with markdown code fences
        mock_response = MagicMock()
        mock_response.text = '''```json
{
  "roomType": "kitchen",
  "currentStyle": "contemporary",
  "keyFeatures": ["stainless steel", "marble countertop"],
  "condition": "good",
  "renovationNotes": "Modern appliances"
}
```'''
        
        mock_models = MagicMock()
        mock_models.generate_content.return_value = mock_response
        
        mock_client = MagicMock()
        mock_client.models = mock_models
        
        with patch('src.vision.triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.triage.genai.Client', return_value=mock_client):
                # Act
                result = await analyze_image_triage(sample_image_bytes)
        
        # Assert
        assert result["success"] is True
        assert result["roomType"] == "kitchen"
        assert "stainless steel" in result["keyFeatures"]
    
    @pytest.mark.asyncio
    async def test_handles_api_error(
        self,
        mock_env_development,
        sample_image_bytes
    ):
        """GIVEN Gemini API raises exception
        WHEN analyze_image_triage is called
        THEN should return error response with fallback data
        """
        # Arrange: Mock API error
        mock_models = MagicMock()
        mock_models.generate_content.side_effect = Exception("API quota exceeded")
        
        mock_client = MagicMock()
        mock_client.models = mock_models
        
        with patch('src.vision.triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.triage.genai.Client', return_value=mock_client):
                # Act
                result = await analyze_image_triage(sample_image_bytes)
        
        # Assert
        assert result["success"] is False
        assert result["roomType"] == "living space"  # Fallback value
        assert "API quota exceeded" in result["renovationNotes"]
    
    @pytest.mark.asyncio
    async def test_handles_missing_response_text(
        self,
        mock_env_development,
        sample_image_bytes
    ):
        """GIVEN response with no text
        WHEN analyze_image_triage is called
        THEN should raise exception and return fallback
        """
        # Arrange: Mock empty response
        mock_response = MagicMock()
        mock_response.text = None
        
        mock_models = MagicMock()
        mock_models.generate_content.return_value = mock_response
        
        mock_client = MagicMock()
        mock_client.models = mock_models
        
        with patch('src.vision.triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.triage.genai.Client', return_value=mock_client):
                # Act
                result = await analyze_image_triage(sample_image_bytes)
        
        # Assert
        assert result["success"] is False
        assert "Unable to perform detailed analysis" in result["renovationNotes"]
    
    @pytest.mark.asyncio
    async def test_handles_malformed_json(
        self,
        mock_env_development,
        sample_image_bytes
    ):
        """GIVEN malformed JSON response from vision model
        WHEN analyze_image_triage is called
        THEN should handle gracefully and return fallback
        """
        # Arrange: Mock malformed JSON
        mock_response = MagicMock()
        mock_response.text = "This is not JSON at all!"
        
        mock_models = MagicMock()
        mock_models.generate_content.return_value = mock_response
        
        mock_client = MagicMock()
        mock_client.models = mock_models
        
        with patch('src.vision.triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.triage.genai.Client', return_value=mock_client):
                # Act
                result = await analyze_image_triage(sample_image_bytes)
        
        # Assert
        assert result["success"] is False
        assert result["roomType"] == "living space"  # Fallback
    
    @pytest.mark.asyncio
    async def test_returns_fallback_values_on_parse_error(
        self,
        mock_env_development,
        sample_image_bytes
    ):
        """GIVEN JSON missing required keys
        WHEN analyze_image_triage is called
        THEN should use default/fallback values
        """
        # Arrange: Mock incomplete JSON
        mock_response = MagicMock()
        mock_response.text = json.dumps({
            "roomType": "bedroom"
            # Missing other required fields
        })
        
        mock_models = MagicMock()
        mock_models.generate_content.return_value = mock_response
        
        mock_client = MagicMock()
        mock_client.models = mock_models
        
        with patch('src.vision.triage.GEMINI_API_KEY', 'test-key'):
            with patch('src.vision.triage.genai.Client', return_value=mock_client):
                # Act
                result = await analyze_image_triage(sample_image_bytes)
        
        # Assert
        assert result["success"] is True
        assert result["roomType"] == "bedroom"
        assert result["currentStyle"] == "contemporary"  # Default
        assert result["keyFeatures"] == []  # Default
        assert result["condition"] == "good"  # Default
