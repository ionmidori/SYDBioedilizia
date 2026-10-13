import requests
import uuid
import time

BASE_URL = "http://127.0.0.1:8080"
TIMEOUT = 30
TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6ImY1MzMwMzNhMTMzYWQyM2EyYzlhZGNmYzE4YzRlM2E3MWFmYWY2MjkiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL3NlY3VyZXRva2VuLmdvb2dsZS5jb20vY2hhdGJvdGx1Y2EtYThhNzMiLCJhdWQiOiJjaGF0Ym90bHVjYS1hOGE3MyIsImF1dGhfdGltZSI6MTc3MTcxNDQ1NSwidXNlcl9pZCI6InRlc3RzcHJpdGUtcWEtdXNlciIsInN1YiI6InRlc3RzcHJpdGUtcWEtdXNlciIsImlhdCI6MTc3MTcxNDQ1NSwiZXhwIjoxNzcxNzE4MDU1LCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7fSwic2lnbl9pbl9wcm92aWRlciI6ImN1c3RvbSJ9fQ.0WvnjqNuVvEzfNsoT0-pNuqlKJUEnNkSTX5H44SsRYMM1Q6kqVEnbHx32Tht_5pa8lZHrAxAihbEZMAd0F27Tx6huUnME3vrFzN9aAjMJZwlcHem4c1kpqcnZdDtNuhjF9sq7sc9Uku5ZRQ-0paCapYRcarEmdAZ9_stz4L_-qNHZV0ggVfn5-T5kMlvf6nPotGFAslgrw4uPQO_fW4Tr01AyvQv19hPiUFOUS_JvqVHc25pbzsdww0v7CIvL4WH3c4hPfCA_ROeeQsjm2VQ2gjXPigecJXamhFz7gvx_76M0y2hpEgwpJoaw7SvMnmEgZt2r3VxFKNFxImvN0wI1g"
HEADERS = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {TOKEN}"
}

def test_save_quote_stores_structured_renovation_draft():
    project_id = None
    try:
        # 1. Create a project to attach the quote to
        print("1. Creating project...")
        proj_resp = requests.post(
            f"{BASE_URL}/api/projects",
            json={
                "title": "TC004 Integration Test",
                "property_type": "apartment",
                "address": "123 TC004 Ave.",
                "sqm": 120,
                "rooms": 4,
                "bathrooms": 2,
                "budget": 50000,
                "timeline": "3_months",
                "notes": "Testing quote workflow."
            },
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert proj_resp.status_code == 200, f"Failed to create project: {proj_resp.text}"
        project_id = proj_resp.json()["session_id"]
        print(f"   Created project: {project_id}")

        # 1.5 Simulate a user requesting a quote via chat to populate history
        print("1.5 Simulating user chat...")
        chat_payload = {
            "messages": [
                {"role": "user", "content": "I need to renovate my 20mq living room. I want to demolish old floor, put new ceramic tiles, and paint the walls."}
            ],
            "sessionId": project_id,
            "projectId": project_id,
        }
        chat_resp = requests.post(
            f"{BASE_URL}/chat/stream",
            json=chat_payload,
            headers=HEADERS,
            timeout=15,
            stream=True
        )
        assert chat_resp.status_code == 200, f"Failed to send chat: {chat_resp.text}"
        # consume the SSE stream to ensure it finishes
        for _ in chat_resp.iter_lines():
            pass
        print("   Chat simulation completed.")

        # 2. Retrieve the draft the assistant saved from the chat
        print("2. Retrieving quote draft...")
        get_resp = requests.get(f"{BASE_URL}/quote/{project_id}", headers=HEADERS, timeout=TIMEOUT)
        assert get_resp.status_code == 200, f"Failed to get quote: {get_resp.text}"
        quote_data = get_resp.json()
        print(f"   Quote retrieved, status: {quote_data.get('status')}")

    finally:
        # Cleanup
        if project_id:
            print("3. Cleaning up project...")
            del_resp = requests.delete(
                f"{BASE_URL}/api/projects/{project_id}",
                headers=HEADERS,
                timeout=TIMEOUT
            )
            print(f"   Cleanup result: {del_resp.status_code}")

if __name__ == "__main__":
    test_save_quote_stores_structured_renovation_draft()