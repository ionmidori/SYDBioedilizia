"""
Integration Tests - Render Generation Tool
===========================================
End-to-end tests for the generate_render tool (T2I and I2I modes).
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from src.tools.generate_render import generate_render_wrapper


class TestRenderGeneration:
    """Integration tests for render generation."""
    
    @pytest.mark.asyncio
    async def test_t2i_generation_success(
        self,
        mock_env_development,
        mock_gemini_imagen_response,
        mock_storage_client
    ):
        """GIVEN text-to-image mode with valid prompt
        WHEN generate_render_wrapper is called
        THEN should generate image and return markdown with URL
        """
        # Arrange
        with patch('src.tools.generate_render.generate_image_t2i', new_callable=AsyncMock) as mock_t2i:
            with patch('src.tools.generate_render.upload_base64_image') as mock_upload:
                mock_t2i.return_value = mock_gemini_imagen_response
                mock_upload.return_value = "https://storage.googleapis.com/test/renders/image.jpg"
                
                # Act
                result = await generate_render_wrapper(
                    prompt="Modern living room with natural light",
                    room_type="living room",
                    style="Modern Minimalist",
                    session_id="test-session",
                    mode="creation"
                )
        
        # Assert
        assert "✅ Rendering generated successfully" in result
        assert "![Design](https://storage.googleapis.com/" in result
        mock_t2i.assert_called_once()
        mock_upload.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_i2i_generation_with_architect(
        self,
        mock_env_development,
        sample_image_bytes,
        mock_gemini_vision_response,
        mock_gemini_imagen_response
    ):
        """GIVEN image-to-image mode with source image URL
        WHEN generate_render_wrapper is called
        THEN should download image, run Architect, generate I2I, and upload
        """
        # Arrange: Mock HTTP download
        mock_http_response = MagicMock()
        mock_http_response.content = sample_image_bytes
        mock_http_response.headers = {"content-type": "image/jpeg"}
        
        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value.get.return_value = mock_http_response
        
        # NOTE: Patch src.vision.architect.generate_architectural_prompt because it is imported LOCALLY in the function
        with patch('src.tools.generate_render.httpx.AsyncClient', return_value=mock_http_client):
            with patch('src.vision.architect.generate_architectural_prompt', new_callable=AsyncMock) as mock_architect:
                with patch('src.tools.generate_render.generate_image_i2i', new_callable=AsyncMock) as mock_i2i:
                    with patch('src.tools.generate_render.upload_base64_image') as mock_upload:
                        # Configure mocks
                        from src.vision.architect import ArchitectOutput
                        mock_architect.return_value = ArchitectOutput(
                            structural_skeleton=mock_gemini_vision_response["structuralSkeleton"],
                            material_plan=mock_gemini_vision_response["materialPlan"],
                            furnishing_strategy=mock_gemini_vision_response["furnishingStrategy"],
                            technical_notes=mock_gemini_vision_response["technicalNotes"]
                        )
                        mock_i2i.return_value = mock_gemini_imagen_response
                        mock_upload.return_value = "https://storage.googleapis.com/test/renders/transformed.jpg"
                        
                        # Act
                        result = await generate_render_wrapper(
                            prompt="Transform to Industrial style",
                            room_type="living room",
                            style="Industrial",
                            session_id="test-session",
                            mode="modification",
                            source_image_url="https://example.com/source.jpg",
                            keep_elements=["floor", "stairs"]
                        )
        
        # Assert
        assert "✅ Rendering transformed successfully" in result
        assert "![Design]" in result
        
        # Verify Architect was called with correct params
        mock_architect.assert_called_once()
        call_kwargs = mock_architect.call_args.kwargs
        assert call_kwargs["target_style"] == "Industrial"
        assert call_kwargs["keep_elements"] == ["floor", "stairs"]
        assert call_kwargs["mime_type"] == "image/jpeg"
        
        # Verify I2I was called
        mock_i2i.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_i2i_invalid_mime_type_rejection(
        self,
        mock_env_development
    ):
        """GIVEN source image URL returns XML error (not an image)
        WHEN generate_render_wrapper is called
        THEN should detect non-image MIME type and return error
        """
        # Arrange: Mock HTTP download returning XML error
        mock_http_response = MagicMock()
        mock_http_response.content = b'<?xml version="1.0"?><Error>Access Denied</Error>'
        mock_http_response.headers = {"content-type": "application/xml; charset=UTF-8"}
        
        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value.get.return_value = mock_http_response
        
        with patch('src.tools.generate_render.httpx.AsyncClient', return_value=mock_http_client):
            # Act
            result = await generate_render_wrapper(
                prompt="Transform",
                room_type="living room",
                style="Modern",
                session_id="test-session",
                mode="modification",
                source_image_url="https://example.com/broken.jpg"
            )
        
        # Assert
        assert "Errore" in result
        assert "application/xml" in result
    
    @pytest.mark.asyncio
    async def test_architect_fallback_on_error(
        self,
        mock_env_development,
        sample_image_bytes,
        mock_gemini_imagen_response
    ):
        """GIVEN Architect fails during I2I
        WHEN generate_render_wrapper is called
        THEN should use fallback prompt and still generate image
        """
        # Arrange
        mock_http_response = MagicMock()
        mock_http_response.content = sample_image_bytes
        mock_http_response.headers = {"content-type": "image/jpeg"}
        
        mock_http_client = AsyncMock()
        mock_http_client.__aenter__.return_value.get.return_value = mock_http_response
        
        # NOTE: Patch src.vision.architect since it's locally imported
        with patch('src.tools.generate_render.httpx.AsyncClient', return_value=mock_http_client):
            with patch('src.vision.architect.generate_architectural_prompt', new_callable=AsyncMock) as mock_architect:
                with patch('src.tools.generate_render.generate_image_i2i', new_callable=AsyncMock) as mock_i2i:
                    with patch('src.tools.generate_render.upload_base64_image') as mock_upload:
                        # Make Architect fail
                        mock_architect.side_effect = Exception("Vision API error")
                        mock_i2i.return_value = mock_gemini_imagen_response
                        mock_upload.return_value = "https://storage.googleapis.com/test/renders/image.jpg"
                        
                        # Act
                        result = await generate_render_wrapper(
                            prompt="Modern style",
                            room_type="kitchen",
                            style="Modern",
                            session_id="test-session",
                            mode="modification",
                            source_image_url="https://example.com/source.jpg"
                        )
        
        # Assert: Should still succeed with fallback
        assert "✅ Rendering transformed successfully" in result
        
        # Verify I2I was called with fallback prompt
        mock_i2i.assert_called_once()
        call_kwargs = mock_i2i.call_args.kwargs
        assert "Transform this kitchen to Modern style" in call_kwargs["prompt"]
