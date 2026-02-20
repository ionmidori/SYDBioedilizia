import requests

BASE_URL = "http://localhost:8080"
TIMEOUT = 30

def test_get_market_prices_fetches_current_data():
    url = f"{BASE_URL}/api/test/tools/market-prices"
    headers = {
        "Accept": "application/json",
        "Authorization": "Bearer dummy" # TestSprite replaces this
    }
    try:
        response = requests.get(url, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    assert response.status_code == 200, f"Unexpected status code: {response.status_code}"

    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not valid JSON"

    # Validate that the response contains current market prices data structure
    # Assuming the response is a JSON object with keys representing materials or services,
    # each having a "price" key with a positive number.
    assert isinstance(data, dict), "Response JSON is not an object"

    assert data, "Response JSON is empty"

    for item, details in data.items():
        assert isinstance(item, str) and item, "Item key should be non-empty string"
        assert isinstance(details, dict), f"Details for {item} should be an object"
        price = details.get("price")
        assert price is not None, f"Price missing for item {item}"
        assert isinstance(price, (int, float)), f"Price for item {item} should be a number"
        assert price >= 0, f"Price for item {item} should be non-negative"

    # Optionally check timestamp or source info if present
    timestamp = data.get("timestamp")
    if timestamp:
        assert isinstance(timestamp, str), "Timestamp should be a string"

test_get_market_prices_fetches_current_data()
