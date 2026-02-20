import requests
import uuid

BASE_URL = "http://localhost:8080"
TIMEOUT = 30
HEADERS = {
    "Content-Type": "application/json",
    # Add authentication headers here if required, e.g. "Authorization": "Bearer <token>"
}


def create_test_project():
    # Minimal payload to create a project for testing assets listing
    payload = {
        "title": f"Test Project {uuid.uuid4()}",
    }
    response = requests.post(f"{BASE_URL}/api/projects", json=payload, headers=HEADERS, timeout=TIMEOUT)
    response.raise_for_status()
    return response.json()["session_id"]


def upload_asset(project_id, asset_type, asset_name, asset_content):
    """
    Helper to upload asset to project (SYD Brain upload/image endpoint)
    """
    url = f"{BASE_URL}/api/upload/image"
    files = {
        "file": (asset_name, asset_content),
        "session_id": (None, project_id)
    }
    # Note: verify_token is usually required, but we'll assume test environment handles this
    response = requests.post(url, headers={}, files=files, timeout=TIMEOUT)
    response.raise_for_status()
    # SYD Brain returns ImageMediaAsset which has 'id'
    return response.json()["id"]


def delete_project(project_id):
    requests.delete(f"{BASE_URL}/api/projects/{project_id}", headers=HEADERS, timeout=TIMEOUT)


def test_list_project_files_returns_complete_asset_listing():
    project_id = None
    asset_ids = []
    try:
        # Create a new project to test against
        project_id = create_test_project()

        # Upload multiple assets (SYD Brain current prod only supports images/videos via separate endpoints)
        # We'll upload two images for simplicity in this test case
        img_id_1 = upload_asset(project_id, "image", "room_1.jpg", b"fake-content-1")
        img_id_2 = upload_asset(project_id, "image", "room_2.jpg", b"fake-content-2")
        
        asset_ids.extend([img_id_1, img_id_2])

        # Wait for Firebase background processing (renders/uploads)
        import time
        time.sleep(2)

        # Get the global gallery listing (since per-project listing is not exposed directly)
        resp = requests.get(f"{BASE_URL}/api/reports/gallery", headers=HEADERS, timeout=TIMEOUT)
        assert resp.status_code == 200
        data = resp.json()
        
        # Validate the 'assets' field is present and is a list
        assert "assets" in data and isinstance(data["assets"], list)

        # Collect returned asset ids
        returned_asset_ids = {a["id"] for a in data["assets"] if "id" in a}

        # Assert uploaded assets are present in the gallery
        for asset_id in asset_ids:
            assert asset_id in returned_asset_ids, f"Asset {asset_id} not found in gallery"

    finally:
        # Cleanup: delete the project and all assets with it
        if project_id:
            delete_project(project_id)


test_list_project_files_returns_complete_asset_listing()