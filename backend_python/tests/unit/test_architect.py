"""
Unit Tests - Architect (Vision)
================================
Tests for the architectural prompt generation (vision analysis).
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from src.vision.architect import generate_architectural_prompt, ArchitectOutput


class TestArchitectPromptGeneration:
    """Test Architect vision analysis and prompt generation."""
    
    @pytest.mark.asyncio
    async def test_successful_generation(
        self, 
        mock_env_development, 
        sample_image_bytes,
        mock_gemini_vision_response
    ):
        """GIVEN valid image bytes and style
        WHEN generate_architectural_prompt is called
        THEN should return structured ArchitectOutput
        """
        # Arrange: Mock LangChain LLM response
        mock_llm_response = MagicMock()
        # Clean JSON string without hidden characters
        mock_llm_response.content = f"""```json
{{"structuralSkeleton": "{mock_gemini_vision_response['structuralSkeleton']}",
 "materialPlan": "{mock_gemini_vision_response['materialPlan']}",
 "furnishingStrategy": "{mock_gemini_vision_response['furnishingStrategy']}",
 "technicalNotes": "{mock_gemini_vision_response['technicalNotes']}"}}
```"""
        
        # Create sync mock with proper return value
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response
        
        with patch('src.vision.architect.ChatGoogleGenerativeAI', return_value=mock_llm):
            # Act
            result = await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Modern Minimalist",
                keep_elements=["floor"],
                mime_type="image/jpeg"
            )
        
        # Assert
        assert isinstance(result, ArchitectOutput)
        content = (result.structural_skeleton + result.material_plan + result.furnishing_strategy).lower()
        assert "living room" in content or "modern minimalist" in content
    
    @pytest.mark.asyncio
    async def test_json_parsing_handles_code_fences(
        self, 
        mock_env_development, 
        sample_image_bytes
    ):
        """GIVEN LLM returns JSON wrapped in code fences
        WHEN parsing the response
        THEN should strip fences and parse correctly
        """
        # Arrange
        mock_llm_response = MagicMock()
        mock_llm_response.content = '''```json
{"structuralSkeleton": "Test skeleton",
 "materialPlan": "Test materials",
 "furnishingStrategy": "Test furniture",
 "technicalNotes": "Test notes"}
```'''
        
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response
        
        with patch('src.vision.architect.ChatGoogleGenerativeAI', return_value=mock_llm):
            # Act
            result = await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Modern",
                mime_type="image/jpeg"
            )
        
        # Assert: Successfully parsed despite code fences
        assert result.structural_skeleton == "Test skeleton"
        assert result.material_plan == "Test materials"
    
    @pytest.mark.asyncio
    async def test_fallback_on_invalid_json(
        self, 
        mock_env_development, 
        sample_image_bytes
    ):
        """GIVEN LLM returns invalid JSON
        WHEN parsing fails
        THEN should return fallback ArchitectOutput
        """
        # Arrange: Return malformed JSON
        mock_llm_response = MagicMock()
        mock_llm_response.content = "This is not JSON at all!"
        
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response
        
        with patch('src.vision.architect.ChatGoogleGenerativeAI', return_value=mock_llm):
            # Act
            result = await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Industrial",
                keep_elements=["walls"]
            )
        
        # Assert: Fallback contains basic structure
        assert isinstance(result, ArchitectOutput)
        # Check case-insensitive to handle "walls" vs "Walls" and "Industrial" vs "industrial"
        assert "industrial" in result.material_plan.lower()
        assert "walls" in result.structural_skeleton.lower()
    
    @pytest.mark.asyncio
    async def test_mime_type_passed_correctly(
        self, 
        mock_env_development, 
        sample_image_bytes
    ):
        """GIVEN PNG image (mime_type='image/png')
        WHEN generating architectural prompt
        THEN should use correct MIME type in data URI
        """
        # Arrange
        mock_llm_response = MagicMock()
        mock_llm_response.content = '{"structuralSkeleton": "test", "materialPlan": "test", "furnishingStrategy": "test", "technicalNotes": "test"}'
        
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = mock_llm_response
        
        with patch('src.vision.architect.ChatGoogleGenerativeAI', return_value=mock_llm):
            # Act
            await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Modern",
                mime_type="image/png"
            )
        
        # Assert: Check that the message content used the PNG MIME type
        call_args = mock_llm.invoke.call_args[0][0]
        message_content = call_args[0].content
        
        # Find the image part
        image_part = next(part for part in message_content if isinstance(part, dict) and part.get("type") == "image_url")
        assert "data:image/png;base64," in image_part["image_url"]["url"]
