import os
import httpx
import firebase_admin
from firebase_admin import credentials, auth
from dotenv import load_dotenv

async def generate_id_token():
    # Load environment variables
    load_dotenv()
    
    project_id = os.getenv("FIREBASE_PROJECT_ID")
    client_email = os.getenv("FIREBASE_CLIENT_EMAIL")
    private_key = os.getenv("FIREBASE_PRIVATE_KEY").replace("\\n", "\n")
    api_key = os.getenv("NEXT_PUBLIC_FIREBASE_API_KEY")
    
    if not all([project_id, client_email, private_key, api_key]):
        print("Error: Missing Firebase environment variables.")
        return None

    # Initialize Firebase Admin SDK
    cred = credentials.Certificate({
        "type": "service_account",
        "project_id": project_id,
        "client_email": client_email,
        "private_key": private_key,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    })
    
    try:
        firebase_admin.get_app()
    except ValueError:
        firebase_admin.initialize_app(cred)

    # 1. Create a custom token for a test user
    uid = "testsprite-qa-user"
    custom_token = auth.create_custom_token(uid)
    
    # 2. Exchange custom token for an ID token
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key={api_key}"
    payload = {
        "token": custom_token.decode("utf-8"),
        "returnSecureToken": True
    }
    
    async with httpx.AsyncClient() as client:
        response = await client.post(url, json=payload)
        if response.status_code == 200:
            id_token = response.json().get("idToken")
            return id_token
        else:
            print(f"Error exchanging custom token: {response.text}")
            return None

if __name__ == "__main__":
    import asyncio
    token = asyncio.run(generate_id_token())
    if token:
        print(token)
