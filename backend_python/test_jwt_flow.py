#!/usr/bin/env python3
"""
Test script to verify JWT token generation and validation
between frontend (Next.js) and backend (FastAPI)
"""
import os
import jwt
import requests
from dotenv import load_dotenv

load_dotenv()

# Load the secret (should match both .env files)
SECRET = os.getenv("INTERNAL_JWT_SECRET")

if not SECRET:
    print("❌ INTERNAL_JWT_SECRET not found in .env")
    exit(1)

print(f"✅ Secret loaded: {SECRET[:3]}... (length: {len(SECRET)})")

# Create a test JWT token (mimicking what Next.js does)
test_payload = {
    "uid": "test-user-123",
    "email": "test@example.com"
}

token = jwt.encode(
    test_payload,
    SECRET,
    algorithm="HS256"
)

print(f"\n📝 Generated Token (first 50 chars):\n{token[:50]}...")

# Try to verify it locally (Python side)
try:
    decoded = jwt.decode(token, SECRET, algorithms=["HS256"])
    print(f"\n✅ Local Python Verification: SUCCESS")
    print(f"   Decoded: {decoded}")
except Exception as e:
    print(f"\n❌ Local Python Verification: FAILED")
    print(f"   Error: {e}")
    exit(1)

# Now send it to the local backend
print(f"\n🌐 Testing against local backend (http://localhost:8080)...")

try:
    response = requests.post(
        "http://localhost:8080/chat/stream",  # Correct endpoint
        json={
            "messages": [],
            "sessionId": "test-session-from-script"
        },
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        timeout=10
    )
    
    print(f"\n📊 Backend Response:")
    print(f"   Status Code: {response.status_code}")
    print(f"   Body: {response.text[:200]}")
    
    if response.status_code == 401:
        print("\n❌ BACKEND REJECTED THE TOKEN!")
        print("   This confirms the issue is in token validation logic.")
    elif response.status_code == 200:
        print("\n✅ BACKEND ACCEPTED THE TOKEN!")
        print("   The JWT flow is working correctly.")
    else:
        print(f"\n⚠️  Unexpected status code: {response.status_code}")
        
except requests.exceptions.ConnectionError:
    print("\n❌ Could not connect to backend - is it running on port 8080?")
except Exception as e:
    print(f"\n❌ Request failed: {e}")
