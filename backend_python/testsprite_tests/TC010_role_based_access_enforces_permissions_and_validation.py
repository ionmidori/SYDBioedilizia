import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_role_based_access_enforces_permissions_and_validation():
    """
    Verify role-based access control (RBAC) and Pydantic validation:
    - Unauthorized roles are rejected with 403 Forbidden.
    - Malformed requests are rejected with 422 Unprocessable Entity.
    This test covers multiple endpoints to ensure security policies are enforced.
    """

    # Define endpoints and corresponding payloads (some malformed)
    endpoints = [
        {
            "url": f"{BASE_URL}/api/submit-lead",
            "method": "POST",
            "valid_payload": {
                "name": "Test User",
                "email": "test.user@example.com",
                "phone": "+1234567890",
                "quote_summary": "Test renovation project",
                "session_id": "test-session"
            },
            "malformed_payload": {
                # Missing email, phone and project_details are wrong type
                "contact_name": ""
            },
        },
        {
            "url": f"{BASE_URL}/api/test/tools/market-prices",
            "method": "GET",
            "valid_payload": None,
            "malformed_payload": None,  # GET with no payload
        },
        {
            "url": f"{BASE_URL}/api/test/tools/generate-render",
            "method": "POST",
            "valid_payload": {
                "room_id": "room123",
                "style": "modern",
                "resolution": "1080p"
            },
            "malformed_payload": {
                "room_id": 123,  # should be str
                "style": "",
                "resolution": "invalid_resolution"
            },
        },
        {
            "url": f"{BASE_URL}/api/projects",
            "method": "POST",
            "valid_payload": {
                "client_id": "client123",
                "items": [
                    {"item": "Paint", "quantity": 5, "unit_price": 20}
                ],
                "notes": "Test quote"
            },
            "malformed_payload": {
                "client_id": 12345,  # should be str
                "items": "not_a_list",
            },
        }
    ]

    # Headers for different roles (simulate authorization tokens)
    headers_by_role = {
        "unauthorized_role": {
            "Authorization": "Bearer unauthorized-role-token",
            "Content-Type": "application/json"
        },
        "authorized_role": {
            "Authorization": "Bearer authorized-role-token",
            "Content-Type": "application/json"
        }
    }

    # Test unauthorized access is rejected with 403
    for endpoint in endpoints:
        try:
            if endpoint["method"] == "GET":
                resp = requests.get(endpoint["url"], headers=headers_by_role["unauthorized_role"], timeout=TIMEOUT)
            elif endpoint["method"] == "POST":
                resp = requests.post(endpoint["url"], json=endpoint["valid_payload"], headers=headers_by_role["unauthorized_role"], timeout=TIMEOUT)
            else:
                continue  # If other HTTP methods appear, skip

            assert resp.status_code == 403, f"Expected 403 for unauthorized role on {endpoint['url']}, got {resp.status_code}"

        except requests.RequestException as e:
            assert False, f"Request failed for unauthorized access test on {endpoint['url']}: {e}"

    # Test malformed requests are rejected with 422 when using authorized role
    for endpoint in endpoints:
        if endpoint["malformed_payload"] is None:
            continue  # skip GET without payload

        try:
            if endpoint["method"] == "POST":
                resp = requests.post(endpoint["url"], json=endpoint["malformed_payload"], headers=headers_by_role["authorized_role"], timeout=TIMEOUT)
            else:
                continue

            assert resp.status_code == 422, f"Expected 422 for malformed request on {endpoint['url']}, got {resp.status_code}"

        except requests.RequestException as e:
            assert False, f"Request failed for malformed payload test on {endpoint['url']}: {e}"

    # Test authorized role with valid payload is accepted (2xx)
    for endpoint in endpoints:
        try:
            if endpoint["method"] == "GET":
                resp = requests.get(endpoint["url"], headers=headers_by_role["authorized_role"], timeout=TIMEOUT)
                assert 200 <= resp.status_code < 300, f"Expected 2xx on GET with authorized role at {endpoint['url']}, got {resp.status_code}"
            elif endpoint["method"] == "POST":
                resp = requests.post(endpoint["url"], json=endpoint["valid_payload"], headers=headers_by_role["authorized_role"], timeout=TIMEOUT)
                # Accept 200, 201, or 202 depending on implementation
                assert 200 <= resp.status_code < 300, f"Expected 2xx on POST with authorized role at {endpoint['url']}, got {resp.status_code}"
            else:
                continue
        except requests.RequestException as e:
            assert False, f"Request failed for authorized valid payload test on {endpoint['url']}: {e}"

test_role_based_access_enforces_permissions_and_validation()
