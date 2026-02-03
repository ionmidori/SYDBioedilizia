
import requests
import json
import os

URL = "http://localhost:8080/chat/stream"
PAYLOAD = {
    "messages": [
        {"role": "user", "content": "Ciao"}
    ],
    "sessionId": "test-session-uuid",
    "projectId": "test-project"
}

def run_test():
    print(f"Connecting to {URL}...")
    try:
        with requests.post(URL, json=PAYLOAD, stream=True) as r:
            print(f"Status: {r.status_code}")
            for line in r.iter_lines():
                if line:
                    decoded = line.decode('utf-8')
                    print(f"CHUNK: {decoded}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    run_test()
