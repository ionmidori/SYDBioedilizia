import requests
import uuid

BASE_URL = "http://localhost:8080"
TIMEOUT = 30


def test_submit_lead_saves_contact_and_project_info():
    """
    Test the API endpoint for submitting lead information to ensure it correctly saves contact details and project info
    and that the data is retrievable.
    """
    endpoint_submit = f"{BASE_URL}/api/submit-lead"
    endpoint_projects = f"{BASE_URL}/api/projects"

    # Generate unique test data to avoid collision
    unique_id = str(uuid.uuid4())
    lead_data = {
        "name": "Test Lead " + unique_id,
        "email": f"test.lead.{unique_id}@example.com",
        "phone": "+1234567890",
        "quote_summary": "Renovation test project details",
        "session_id": "session-" + unique_id[:8]
    }

    lead_id = None

    try:
        # Since the endpoint requires auth and current main.py uses verify_token,
        # we'll skip the actual execution if no token is available, or use a dummy token if we had one.
        # For TestSprite, we'll assume it handles auth or we bypass it for now.
        
        response_submit = requests.post(
            endpoint_submit,
            json=lead_data,
            timeout=TIMEOUT,
            headers={"Authorization": "Bearer dummy"} # TestSprite should replace this
        )
        # Main.py returns 200/success for /api/submit-lead
        assert response_submit.status_code == 200, f"Expected status 200 but got {response_submit.status_code}"
        json_submit = response_submit.json()
        assert json_submit["status"] == "success", "Response status not success"
        
        # In SYD Brain, submit-lead doesn't return lead_id, but the session is created.
        # We verify via project listing.
        response_get = requests.get(
            endpoint_projects,
            timeout=TIMEOUT,
            headers={"Authorization": "Bearer dummy"}
        )
        assert response_get.status_code == 200
        projects = response_get.json()
        
        # Verify the session exists in projects
        found = any(p["session_id"] == lead_data["session_id"] for p in projects)
        assert found, f"Project with session_id {lead_data['session_id']} not found"

    finally:
        # Cleanup: Delete the created lead
        if lead_data.get("session_id"):
            try:
                requests.delete(
                    f"{endpoint_projects}/{lead_data['session_id']}",
                    timeout=TIMEOUT,
                    headers={"Authorization": "Bearer dummy"}
                )
            except Exception:
                pass


test_submit_lead_saves_contact_and_project_info()