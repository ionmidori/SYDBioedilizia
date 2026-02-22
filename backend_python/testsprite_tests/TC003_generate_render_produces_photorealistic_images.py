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
            params={
                "session_id": payload["project_id"]
            },
            json={
                "prompt": payload["room_description"],
                "room_type": "living room",
                "style": payload["style"]
            },
            headers={**headers, "Authorization": "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImY1MzMwMzNhMTMzYWQyM2EyYzlhZGNmYzE4YzRlM2E3MWFmYWY2MjkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vY2hhdGJvdGx1Y2EtYThhNzMiLCJhdWQiOiJjaGF0Ym90bHVjYS1hOGE3MyIsImF1dGhfdGltZSI6MTc3MTcxNDQ1NSwidXNlcl9pZCI6InRlc3RzcHJpdGUtcWEtdXNlciIsInN1YiI6InRlc3RzcHJpdGUtcWEtdXNlciIsImlhdCI6MTc3MTcxNDQ1NSwiZXhwIjoxNzcxNzE4MDU1LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImN1c3RvbSJ9fQ.0WvnjqNuVvEzfNsoT0-pNuqlKJUEnNkSTX5H44SsRYMM1Q6kqVEnbHx32Tht_5pa8lZHrAxAihbEZMAd0F27Tx6huUnME3vrFzN9aAjMJZwlcHem4c1kpqcnZdDtNuhjF9sq7sc9Uku5ZRQ-0paCapYRcarEmdAZ9_stz4L_-qNHZV0ggVfn5-T5kMlvf6nPotGFAslgrw4uPQO_fW4Tr01AyvQv19hPiUFOUS_JvqVHc25pbzsdww0v7CIvL4WH3c4hPfCA_ROeeQsjm2VQ2gjXPigecJXamhFz7gvx_76M0y2hpEgwpJoaw7SvMnmEgZt2r3VxFKNFxImvN0wI1g"},
            timeout=TIMEOUT
        )
        print(f"Generate Render response: {response.text}")
        assert response.status_code == 201 or response.status_code == 200, \
            f"Expected status 200 or 201, got {response.status_code}: {response.text}"

        data = response.json()
        # Validate presence of imageUrl in response
        assert "imageUrl" in data, "Response missing imageUrl"

        # If a URL is returned, validate URL is a non-empty string
        assert isinstance(data["imageUrl"], str) and data["imageUrl"].startswith("http"), \
            "imageUrl is not valid"

        assert data.get("status") == "success", "Expected status success"


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