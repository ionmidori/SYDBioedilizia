import requests
import io

BASE_URL = "http://localhost:8080"
ANALYZE_ROOM_ENDPOINT = f"{BASE_URL}/api/test/tools/analyze-room"
TIMEOUT = 30
HEADERS = {
    "Authorization": "Bearer dummy" # TestSprite replaces this
}


def test_analyze_room_outputs_structural_style_and_condition():
    # Create a minimal JPEG image in memory as a sample input to avoid file dependency
    # This is a minimal 1x1 pixel JPEG
    sample_image_bytes = (
        b'\xff\xd8\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07'
        b'\x09\x09\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f'
        b'(\x1d\x1a\x1f\x1e\x1d\x1a\x1c\x1c $.\' \x27%\x2e\x33\x38\x35\x2e\x31\x2c\x32\x32\x3c)\x3f\x44'
        b'\x46\x45\x44\x40\x43\x41\x1f\x27\x48\x55\x51\x43\x54\x4e\x52\x50\xff\xc0\x00\x11\x08\x00'
        b'\x01\x00\x01\x03\x01"\x00\x02\x11\x01\x03\x11\x01\xff\xc4\x00\x17\x00\x00\x02\x03\x01\x01'
        b'\x01\x01\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\x09\x0a\x0b'
        b'\xff\xc4\x00\x14\x10\x00\x02\x01\x03\x03\x02\x04\x03\x05\x05\x04\x04\x00\x00\x01\x7d\x01\x02'
        b'\x03\x00\x04\x11\x05!1\x06\x12AQ\x07aq\x13"2\x81\x08\x14B\x91\xa1\xb1\xc1\x09\x23#\x42\x15R\xd1'
        b'\xf0$%&\x07\x16\x17\x18\x19\x1a\xff\xda\x00\x0c\x03\x01\x00\x02\x11\x03\x11\x00?\x00\xd2\xcf \xff\xd9'
    )

    files = {'file': ('sample_room.jpg', io.BytesIO(sample_image_bytes), 'image/jpeg')}

    try:
        response = requests.post(
            ANALYZE_ROOM_ENDPOINT,
            headers=HEADERS,
            files=files,
            timeout=TIMEOUT
        )
    except requests.RequestException as e:
        assert False, f"Request failed with exception: {str(e)}"

    assert response.status_code == 200, f"Expected status code 200 but got {response.status_code}"

    try:
        json_data = response.json()
    except ValueError:
        assert False, "Response is not in JSON format"

    # Validate that the response contains the required keys for structural, style, and condition insights
    expected_keys = ['structural_insights', 'style_insights', 'condition_insights']
    for key in expected_keys:
        assert key in json_data, f"Response JSON missing key: {key}"
        assert isinstance(json_data[key], dict) or isinstance(json_data[key], list), (
            f"{key} should be a dict or list but got {type(json_data[key])}"
        )
        assert json_data[key], f"{key} should not be empty"


test_analyze_room_outputs_structural_style_and_condition()
