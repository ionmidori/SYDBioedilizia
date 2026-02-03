
import requests
import time
import json

URL = "http://127.0.0.1:8080/chat/stream"
PAYLOAD = {
    "messages": [
        {"role": "user", "content": "Ciao"}
    ],
    "sessionId": "latency-test",
    "projectId": "test-project"
}

def check_latency():
    print(f"Connecting to {URL}...")
    start_time = time.time()
    try:
        with requests.post(URL, json=PAYLOAD, stream=True) as r:
            print(f"Connection established in {time.time() - start_time:.4f}s")
            
            first_byte_time = None
            
            for line in r.iter_lines():
                if line:
                    now = time.time()
                    if first_byte_time is None:
                        first_byte_time = now
                        latency = first_byte_time - start_time
                        print(f"⚡ FIRST CHUNK RECEIVED after {latency:.4f}s")
                        print(f"Chunk content: {line.decode('utf-8')}")
                    else:
                         print(f"Chunk: {line.decode('utf-8')}")
                    
                    # Stop after first few chunks
                    if time.time() - start_time > 5:
                        break
                        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_latency()
