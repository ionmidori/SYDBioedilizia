import requests
import uuid

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_generate_render_produces_photorealistic_images():
    # Prepare headers; assuming JSON content-type, add auth if required here
    headers = {
        "Content-Type": "application/json"
    }

    # Sample payload to generate a photorealistic interior design render
    # Based on typical expected inputs - room description, style etc.
    # Adjust keys if API schema is known more specifically
    payload = {
        "project_id": str(uuid.uuid4()),
        "room_description": "Modern living room with natural light, wooden floor and neutral color palette",
        "style": "photorealistic",
        "render_type": "interior_design",
        "image_gen_model": "Gemini Image Gen",
        "details": {
            "furniture": ["sofa", "coffee table", "bookshelf"],
            "lighting": "soft warm",
            "textures": ["wood", "glass", "fabric"]
        }
    }

    render_id = None
    try:
        response = requests.post(
            f"{BASE_URL}/api/test/tools/generate-render",
            json={
                "prompt": payload["room_description"],
                "session_id": payload["project_id"]
            },
            headers={**headers, "Authorization": "Bearer dummy"},
            timeout=TIMEOUT
        )
        assert response.status_code == 201 or response.status_code == 200, \
            f"Expected status 200 or 201, got {response.status_code}"

        data = response.json()
        # Validate presence of render ID or URL in response
        assert "render_id" in data or "render_url" in data, "Response missing render_id or render_url"

        if "render_id" in data:
            render_id = data["render_id"]

        # If a URL is returned, validate URL is a non-empty string
        if "render_url" in data:
            assert isinstance(data["render_url"], str) and data["render_url"].startswith("http"), \
                "render_url is not valid"

        # Optionally validate more about the returned details if available e.g. quality, resolution
        if "quality" in data:
            assert data["quality"] in ["high", "photorealistic", "ultra"], \
                f"Unexpected quality level: {data['quality']}"

        if "metadata" in data:
            metadata = data["metadata"]
            # Example: check that metadata contains model info and inputs echoed back correctly
            assert metadata.get("model") == "Gemini Image Gen", "Incorrect model in metadata"
            assert "room_description" in metadata, "Metadata missing room_description"

    finally:
        # Cleanup: delete the render resource if an ID was returned
        if render_id is not None:
            try:
                del_response = requests.delete(
                    f"{BASE_URL}/render/{render_id}",
                    headers=headers,
                    timeout=TIMEOUT
                )
                assert del_response.status_code in [200, 204, 404], \
                    f"Unexpected status code on delete: {del_response.status_code}"
            except Exception as e:
                # Log deletion failure or ignore for test flow
                pass

test_generate_render_produces_photorealistic_images()