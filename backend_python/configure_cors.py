import firebase_admin
from firebase_admin import credentials, storage

def configure_cors():
    # Initialize Firebase Admin
    cred = credentials.Certificate("firebase-service-account.json")
    firebase_admin.initialize_app(cred)

    bucket = storage.bucket("chatbotluca-a8a73.firebasestorage.app")
    print(f"Configuring CORS for bucket: {bucket.name}")

    # Define CORS configuration
    cors_configuration = [
        {
            "origin": [
                "http://localhost:3000",
                "https://website-renovation.vercel.app",
                "https://sydbioedilizia.vercel.app",
                "https://syd-brain-972229558318.europe-west1.run.app"
            ],
            "method": ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
            "responseHeader": ["Content-Type", "x-goog-resumable"],
            "maxAgeSeconds": 3600
        }
    ]

    # Set CORS on the bucket
    bucket.cors = cors_configuration
    bucket.patch()

    print("✅ CORS configuration updated successfully:")
    print(bucket.cors)

if __name__ == "__main__":
    configure_cors()
