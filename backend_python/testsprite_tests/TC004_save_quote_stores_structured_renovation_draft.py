import requests

BASE_URL = "http://localhost:8080"
HEADERS = {
    "Content-Type": "application/json"
}
TIMEOUT = 30

def test_save_quote_stores_structured_renovation_draft():
    quote_data = {
        "client_id": "test-client-123",
        "project_id": "test-project-456",
        "quote_name": "Renovation Draft Test",
        "items": [
            {
                "description": "Kitchen Renovation",
                "quantity": 1,
                "unit_price": 15000,
                "total_price": 15000,
                "details": {
                    "materials": ["Granite Countertop", "Stainless Steel Appliances"],
                    "labor_hours": 120,
                    "contractor": "ABC Renovations"
                }
            },
            {
                "description": "Bathroom Upgrade",
                "quantity": 1,
                "unit_price": 8000,
                "total_price": 8000,
                "details": {
                    "materials": ["Ceramic Tiles", "Glass Shower"],
                    "labor_hours": 60,
                    "contractor": "XYZ Contractors"
                }
            }
        ],
        "total_amount": 23000,
        "status": "draft",
        "last_modified": "2026-02-04T12:00:00Z",
        "notes": "Client requested a draft for review before finalizing."
    }

    resource_id = None
    try:
        # SYD Brain stores structured quote data in project details
        save_resp = requests.patch(
            f"{BASE_URL}/api/projects/{quote_data['project_id']}/details",
            json={
                "id": quote_data['project_id'],
                "footage": 80, # Required by schema usually
                "property_type": "apartment",
                "address": "123 Test St",
                "budget": quote_data['total_amount'],
                "intervention_type": ["renovation"],
                "notes": quote_data['notes']
            },
            headers={**HEADERS, "Authorization": "Bearer dummy"},
            timeout=TIMEOUT
        )
        assert save_resp.status_code == 200, f"Expected 200 OK, got {save_resp.status_code}"
        save_resp_json = save_resp.json()
        assert "quote_id" in save_resp_json, "Response missing 'quote_id' field"
        resource_id = save_resp_json["quote_id"]

        # Retrieve the saved quote draft
        get_resp = requests.get(
            f"{BASE_URL}/api/quotes/{resource_id}",
            headers=HEADERS,
            timeout=TIMEOUT
        )
        assert get_resp.status_code == 200, f"Expected 200 OK, got {get_resp.status_code}"
        retrieved_quote = get_resp.json()

        # Validate structure and content match the saved data (allowing for system-added fields)
        assert retrieved_quote.get("client_id") == quote_data["client_id"], "client_id mismatch"
        assert retrieved_quote.get("project_id") == quote_data["project_id"], "project_id mismatch"
        assert retrieved_quote.get("quote_name") == quote_data["quote_name"], "quote_name mismatch"
        assert retrieved_quote.get("status") == "draft", "status should be 'draft'"
        assert isinstance(retrieved_quote.get("items"), list), "items should be a list"
        assert len(retrieved_quote["items"]) == len(quote_data["items"]), "items length mismatch"

        for orig_item, ret_item in zip(quote_data["items"], retrieved_quote["items"]):
            assert orig_item["description"] == ret_item.get("description"), "Item description mismatch"
            assert orig_item["quantity"] == ret_item.get("quantity"), "Item quantity mismatch"
            assert orig_item["unit_price"] == ret_item.get("unit_price"), "Item unit_price mismatch"
            assert orig_item["total_price"] == ret_item.get("total_price"), "Item total_price mismatch"
            assert orig_item["details"] == ret_item.get("details"), "Item details mismatch"

        assert retrieved_quote.get("total_amount") == quote_data["total_amount"], "total_amount mismatch"
        assert retrieved_quote.get("notes") == quote_data["notes"], "notes mismatch"

    finally:
        # Cleanup: delete the created quote draft if created
            # Delete project
            delete_resp = requests.delete(
                f"{BASE_URL}/api/projects/{quote_data['project_id']}",
                headers={**HEADERS, "Authorization": "Bearer dummy"},
                timeout=TIMEOUT
            )
            assert delete_resp.status_code in (200, 204)

test_save_quote_stores_structured_renovation_draft()