"""
Unit Tests - Architect (Vision)
================================
Tests for the architectural prompt generation (vision analysis).
Uses google.genai native client (migrated from LangChain in Phase 4).
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from src.vision.architect import generate_architectural_prompt, ArchitectOutput


def _make_genai_client_mock(response_text: str) -> MagicMock:
    """Build a mock genai.Client whose aio.models.generate_content returns response_text."""
    mock_response = MagicMock()
    mock_response.text = response_text

    mock_client = MagicMock()
    mock_client.aio.models.generate_content = AsyncMock(return_value=mock_response)
    return mock_client


class TestArchitectPromptGeneration:
    """Test Architect vision analysis and prompt generation."""

    @pytest.mark.asyncio
    async def test_successful_generation(
        self,
        mock_env_development,
        sample_image_bytes,
        mock_gemini_vision_response,
    ):
        """GIVEN valid image bytes and style
        WHEN generate_architectural_prompt is called
        THEN should return structured ArchitectOutput
        """
        response_json = (
            f'{{"structuralSkeleton": "{mock_gemini_vision_response["structuralSkeleton"]}",'
            f' "materialPlan": "{mock_gemini_vision_response["materialPlan"]}",'
            f' "furnishingStrategy": "{mock_gemini_vision_response["furnishingStrategy"]}",'
            f' "technicalNotes": "{mock_gemini_vision_response["technicalNotes"]}"}}'
        )
        mock_client = _make_genai_client_mock(response_json)

        with patch("src.vision.architect.genai.Client", return_value=mock_client):
            result = await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Modern Minimalist",
                keep_elements=["floor"],
                mime_type="image/jpeg",
            )

        assert isinstance(result, ArchitectOutput)
        content = (
            result.structural_skeleton + result.material_plan + result.furnishing_strategy
        ).lower()
        assert "living room" in content or "modern minimalist" in content

    @pytest.mark.asyncio
    async def test_json_parsing_handles_code_fences(
        self,
        mock_env_development,
        sample_image_bytes,
    ):
        """GIVEN LLM returns JSON wrapped in code fences
        WHEN parsing the response
        THEN should strip fences and parse correctly
        """
        response_text = (
            "```json\n"
            '{"structuralSkeleton": "Test skeleton",\n'
            ' "materialPlan": "Test materials",\n'
            ' "furnishingStrategy": "Test furniture",\n'
            ' "technicalNotes": "Test notes"}\n'
            "```"
        )
        mock_client = _make_genai_client_mock(response_text)

        with patch("src.vision.architect.genai.Client", return_value=mock_client):
            result = await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Modern",
                mime_type="image/jpeg",
            )

        assert result.structural_skeleton == "Test skeleton"
        assert result.material_plan == "Test materials"

    @pytest.mark.asyncio
    async def test_fallback_on_invalid_json(
        self,
        mock_env_development,
        sample_image_bytes,
    ):
        """GIVEN LLM returns invalid JSON
        WHEN parsing fails
        THEN should return fallback ArchitectOutput
        """
        mock_client = _make_genai_client_mock("This is not JSON at all!")

        with patch("src.vision.architect.genai.Client", return_value=mock_client):
            result = await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Industrial",
                keep_elements=["walls"],
            )

        assert isinstance(result, ArchitectOutput)
        assert "industrial" in result.material_plan.lower()
        assert "walls" in result.structural_skeleton.lower()

    @pytest.mark.asyncio
    async def test_mime_type_passed_correctly(
        self,
        mock_env_development,
        sample_image_bytes,
    ):
        """GIVEN PNG image (mime_type='image/png')
        WHEN generating architectural prompt
        THEN should use correct MIME type in inline_data Blob
        """
        response_json = (
            '{"structuralSkeleton": "test", "materialPlan": "test",'
            ' "furnishingStrategy": "test", "technicalNotes": "test"}'
        )
        mock_client = _make_genai_client_mock(response_json)

        with patch("src.vision.architect.genai.Client", return_value=mock_client):
            await generate_architectural_prompt(
                image_bytes=sample_image_bytes,
                target_style="Modern",
                mime_type="image/png",
            )

        # Inspect the Contents passed to generate_content
        call_kwargs = mock_client.aio.models.generate_content.call_args.kwargs
        contents = call_kwargs["contents"]
        # contents[0] is a genai_types.Content; parts[1] is the image Part
        image_part = contents[0].parts[1]
        assert image_part.inline_data.mime_type == "image/png"
