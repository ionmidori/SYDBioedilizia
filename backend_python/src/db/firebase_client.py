import os
import logging
from typing import Dict, Any
from datetime import datetime
from firebase_admin import credentials, firestore, storage, initialize_app

def get_storage_client():
    """Get Firebase Storage client."""
    init_firebase()
    return storage.bucket()
import firebase_admin

logger = logging.getLogger(__name__)

# Global credential cache
_cached_cred = None
_async_db_client = None

# Initialize Firebase Admin SDK (singleton pattern)
def init_firebase():
    """Initialize Firebase Admin SDK if not already initialized."""
    global _cached_cred
    
    if not firebase_admin._apps:
        # Check for service account JSON file or use environment variables
        if os.path.exists('/secrets/service-account.json'):
            # Production: mounted secret
            cred = credentials.Certificate('/secrets/service-account.json')
            logger.info("Using production service account: /secrets/service-account.json")
        elif os.path.exists('firebase-service-account.json'):
            # Development: local file (PRIORITY)
            cred = credentials.Certificate('firebase-service-account.json')
            logger.info("Using local service account: firebase-service-account.json")
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
        _cached_cred = cred  # Cache for generic Google Cloud clients
        logger.info("Firebase Admin SDK initialized")
    
    elif _cached_cred is None:
        pass

def get_firestore_client():
    """Get Sync Firestore client."""
    init_firebase()
    return firestore.client()

def get_async_firestore_client():
    """
    Get Asynchronous Firestore client (google-cloud-firestore).
    Singleton pattern to reuse gRPC channel.
    """
    global _async_db_client
    if _async_db_client:
        return _async_db_client

    from google.cloud import firestore as google_firestore
    
    init_firebase()
    
    # Use cached credentials if available
    if _cached_cred:
         # _cached_cred.get_credential() returns google.oauth2.service_account.Credentials
         client = google_firestore.AsyncClient(
             project=_cached_cred.project_id,
             credentials=_cached_cred.get_credential()
         )
    else:
        # Fallback (should rarely happen if init_firebase runs first)
        client = google_firestore.AsyncClient()
        
    _async_db_client = client
    return client

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
    
    # Cloud Run: If the secret file is mounted, we don't need all env vars
    if os.path.exists('/secrets/service-account.json'):
        # Check if we at least have project ID/Bucket (useful but not strictly required for auth)
        if not os.getenv('FIREBASE_STORAGE_BUCKET'):
             logger.warning("⚠️ FIREBASE_STORAGE_BUCKET not set. Storage operations might fail if not inferred.")
        logger.info("✅ Firebase configuration validated (using mounted secret: /secrets/service-account.json)")
        return

    if missing:
        raise RuntimeError(
            f"❌ Missing Firebase configuration: {', '.join(missing)}\n"
            f"Please set these environment variables before starting the server."
        )
    
    logger.info("✅ Firebase configuration validated")

