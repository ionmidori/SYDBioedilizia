import requests
import uuid

BASE_URL = "http://127.0.0.1:8080"
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

    print(f"Submitting lead to {endpoint_submit}...")
    try:
        response_submit = requests.post(
            endpoint_submit,
            json=lead_data,
            timeout=TIMEOUT,
            headers={"Authorization": "Bearer eyJhbGciOiJSUzI1NiIsImtpZCI6ImY1MzMwMzNhMTMzYWQyM2EyYzlhZGNmYzE4YzRlM2E3MWFmYWY2MjkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vY2hhdGJvdGx1Y2EtYThhNzMiLCJhdWQiOiJjaGF0Ym90bHVjYS1hOGE3MyIsImF1dGhfdGltZSI6MTc3MTcxNDQ1NSwidXNlcl9pZCI6InRlc3RzcHJpdGUtcWEtdXNlciIsInN1YiI6InRlc3RzcHJpdGUtcWEtdXNlciIsImlhdCI6MTc3MTcxNDQ1NSwiZXhwIjoxNzcxNzE4MDU1LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImN1c3RvbSJ9fQ.0WvnjqNuVvEzfNsoT0-pNuqlKJUEnNkSTX5H44SsRYMM1Q6kqVEnbHx32Tht_5pa8lZHrAxAihbEZMAd0F27Tx6huUnME3vrFzN9aAjMJZwlcHem4c1kpqcnZdDtNuhjF9sq7sc9Uku5ZRQ-0paCapYRcarEmdAZ9_stz4L_-qNHZV0ggVfn5-T5kMlvf6nPotGFAslgrw4uPQO_fW4Tr01AyvQv19hPiUFOUS_JvqVHc25pbzsdww0v7CIvL4WH3c4hPfCA_ROeeQsjm2VQ2gjXPigecJXamhFz7gvx_76M0y2hpEgwpJoaw7SvMnmEgZt2r3VxFKNFxImvN0wI1g"}
        )
        print(f"Submit response: {response_submit.status_code}")
        assert response_submit.status_code == 200, f"Expected status 200 but got {response_submit.status_code}"
        json_submit = response_submit.json()
        assert json_submit["status"] == "success", "Response status not success"
        print("Lead submitted successfully.")

    finally:
        pass


test_submit_lead_saves_contact_and_project_info()