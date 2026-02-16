
import httpx
import asyncio

async def test_endpoint():
    print("Testing /api/reports/dashboard...")
    async with httpx.AsyncClient() as client:
        try:
            # Note: This will fail with 401/403 if auth is enforced, 
            # but we want to see if we get a 500 or if the server is up.
            response = await client.get("http://localhost:8080/api/reports/dashboard", timeout=5.0)
            print(f"Status Code: {response.status_code}")
            print(f"Response Body: {response.text}")
        except Exception as e:
            print(f"Connection Error: {e}")

if __name__ == "__main__":
    asyncio.run(test_endpoint())
