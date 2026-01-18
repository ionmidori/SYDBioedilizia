import os
import logging
from typing import Dict, Any
from datetime import datetime
from firebase_admin import credentials, firestore, initialize_app
import firebase_admin

logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK (singleton pattern)
def _init_firebase():
    """Initialize Firebase Admin SDK if not already initialized."""
    if not firebase_admin._apps:
        # Check for service account JSON file or use environment variables
        if os.path.exists('/app/service-account.json'):
            # Production: mounted secret
            cred = credentials.Certificate('/app/service-account.json')
        else:
            # Development: use environment variables
            cred = credentials.Certificate({
                'type': 'service_account',
                'project_id': os.getenv('FIREBASE_PROJECT_ID'),
                'private_key_id': os.getenv('FIREBASE_PRIVATE_KEY_ID'),
                'private_key': os.getenv('FIREBASE_PRIVATE_KEY', '').replace('\\n', '\n'),
                'client_email': os.getenv('FIREBASE_CLIENT_EMAIL'),
                'client_id': os.getenv('FIREBASE_CLIENT_ID'),
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            })
        
        initialize_app(cred)
        logger.info("Firebase Admin SDK initialized")

def get_firestore_client():
    """Get Firestore client, initializing Firebase if needed."""
    _init_firebase()
    return firestore.client()

def validate_firebase_config():
    """
    Validate all required Firebase environment variables are present.
    
    Raises:
        RuntimeError: If any required environment variable is missing
    """
    required_vars = [
        'FIREBASE_PROJECT_ID',
        'FIREBASE_PRIVATE_KEY',
        'FIREBASE_CLIENT_EMAIL',
        'FIREBASE_STORAGE_BUCKET'
    ]
    
    missing = [var for var in required_vars if not os.getenv(var)]
    
    if missing:
        raise RuntimeError(
            f"❌ Missing Firebase configuration: {', '.join(missing)}\n"
            f"Please set these environment variables before starting the server."
        )
    
    logger.info("✅ Firebase configuration validated")

