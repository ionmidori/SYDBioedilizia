import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_generate_cad_creates_downloadable_dxf_file():
    """
    Test the CAD generation endpoint to ensure it extracts structural geometry
    from room images and generates a downloadable DXF file without format errors.
    """
    # Step 1: We need to create/upload a room image resource first (If API supports)
    # Since no resource ID is provided, we assume an image upload endpoint exists at /upload-room-image
    # and returns an image_id or use multipart form to send image for CAD generation directly.
    # Using a sample image file content for testing purpose.
    generate_cad_url = f"{BASE_URL}/api/test/tools/generate-cad"
    headers = {
        "Authorization": "Bearer dummy",
        "Content-Type": "application/json"
    }
    
    # Read the sample image file
        # Request CAD generation via tool test endpoint
        payload = {"image_url": "https://example.com/test-room.jpg"}
        resp_cad = requests.post(generate_cad_url, json=payload, headers=headers, timeout=TIMEOUT)
        resp_cad.raise_for_status()
        
        # Response should be a downloadable DXF file as attachment or binary content
        content_type = resp_cad.headers.get("Content-Type", "")
        content_disp = resp_cad.headers.get("Content-Disposition", "")
        
        # Validate content type for DXF file
        assert content_type in ("application/dxf", "application/octet-stream", "application/xml", "text/plain"), \
            f"Unexpected Content-Type: {content_type}"

        # Validate content disposition for attachment and filename with .dxf extension
        assert "attachment" in content_disp.lower(), "Response is not an attachment."
        assert content_disp.lower().endswith(".dxf\"") or ".dxf" in content_disp.lower(), \
            "Attachment filename does not have .dxf extension."

        # Validate content is non-empty and starts with typical DXF header (ASCII DXF files start with "0\nSECTION\n")
        content = resp_cad.content
        assert content and len(content) > 100, "DXF file content is empty or too small."

        # Check for DXF header string in content (try decode as ascii ignoring errors)
        try:
            content_text = content.decode("ascii", errors="ignore")
        except Exception:
            content_text = ""
        assert "SECTION" in content_text and "HEADER" in content_text, "DXF file content missing required sections."

    finally:
        # Cleanup uploaded image resource if deletion endpoint exists
        delete_image_url = f"{BASE_URL}/room-images/{image_id}" if 'image_id' in locals() else None
        if delete_image_url:
            try:
                requests.delete(delete_image_url, timeout=TIMEOUT)
            except Exception:
                pass

test_generate_cad_creates_downloadable_dxf_file()