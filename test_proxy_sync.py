import urllib.request
import json
import traceback

req = urllib.request.Request("http://127.0.0.1:3000/chat/stream", method="POST")
req.add_header("Authorization", "Bearer DUMMY")
req.add_header("Content-Type", "application/json")
data = json.dumps({"messages":[{"role":"user","content":"ciao proxy"}],"sessionId":"test1234","is_authenticated":True}).encode()

try:
    with urllib.request.urlopen(req, data=data) as response:
        print("STATUS:", response.status)
        print("HEADERS:", response.headers)
        for line in response:
            print("CHUNK:", line)
except urllib.error.HTTPError as e:
    print("HTTP ERROR:", e.code)
    print(e.read())
except Exception as e:
    traceback.print_exc()
