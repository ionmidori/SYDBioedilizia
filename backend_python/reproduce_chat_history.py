import requests
import os
import sys

# Configuration
BASE_URL = "http://localhost:8080"
SESSION_ID = "e36a3c2a-8324-4295-9c18-8131f8773a07" # From logs
# We need a valid token. For dev/debug, maybe we can bypass or use a mock.
# If auth is bypassed in dev, we might not need a token?
# Let's check headers.

def test_get_history():
    print(f"Testing Chat History for Session: {SESSION_ID}")
    
    headers = {}
    
    try:
        url = f"{BASE_URL}/api/sessions/{SESSION_ID}/messages?limit=10"
        print(f"GET {url}")
        response = requests.get(url, headers=headers)
        
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("Success!")
            print(f"Message Count: {len(data.get('messages', []))}")
            # print first message to check structure
            if data.get('messages'):
                print("First Message Sample:", data['messages'][0])
        else:
            print("Failed.")
            print(response.text)

    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    test_get_history()
