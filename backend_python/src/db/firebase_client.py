import os
import logging
import json
from datetime import datetime
from firebase_admin import credentials, firestore, storage, initialize_app
from src.core.config import settings

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
    
    # ✅ Idempotency Check (Robust)
    try:
        app = firebase_admin.get_app()
        if _cached_cred is None:
            _cached_cred = app.credential
        return
    except ValueError:
        # Not initialized, proceed to init
        pass

    try:
        # Check for service account JSON file (Production Secret or Local)
        # Priority 1: settings.FIREBASE_CREDENTIALS (if set)
        # Priority 2: /secrets/service-account.json (Cloud Run default)
        # Priority 3: firebase-service-account.json (Local default)
        
        cert_path = settings.FIREBASE_CREDENTIALS
        if not cert_path and os.path.exists('/secrets/service-account.json'):
             cert_path = '/secrets/service-account.json'
        elif not cert_path and os.path.exists('firebase-service-account.json'):
             cert_path = 'firebase-service-account.json'
             
        if cert_path and os.path.exists(cert_path):
            cred = credentials.Certificate(cert_path)
            logger.info(f"Using service account: {cert_path}")
        else:
            # Priority 4: Environment Variables via Settings
            logger.info("Using environment variables for Firebase Creds")
            # Handle newline escaping in private key
            private_key = settings.FIREBASE_PRIVATE_KEY
            if private_key:
                private_key = private_key.replace('\\n', '\n')
                
            cred = credentials.Certificate({
                'type': 'service_account',
                'project_id': settings.FIREBASE_PROJECT_ID,
                'private_key_id': settings.FIREBASE_PRIVATE_KEY_ID,
                'private_key': private_key,
                'client_email': settings.FIREBASE_CLIENT_EMAIL,
                'client_id': settings.FIREBASE_CLIENT_ID,
                'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
                'token_uri': 'https://oauth2.googleapis.com/token',
            })
        
        if settings.FIREBASE_STORAGE_BUCKET:
            initialize_app(cred, {
                'storageBucket': settings.FIREBASE_STORAGE_BUCKET
            })
        else:
            initialize_app(cred)
            
        _cached_cred = cred  # Cache for generic Google Cloud clients
        logger.info("Firebase Admin SDK initialized")
    
    except ValueError as ve:
        # If we race-conditioned and it's already init, just ignore
        if "The default Firebase app already exists" in str(ve):
             pass
        else:
             raise ve

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
        # Check settings
        required_vars = [
            settings.FIREBASE_PROJECT_ID,
            settings.FIREBASE_PRIVATE_KEY,
            settings.FIREBASE_CLIENT_EMAIL,
            settings.FIREBASE_STORAGE_BUCKET
        ]
        if not all(required_vars) and not (settings.FIREBASE_CREDENTIALS or os.path.exists('/secrets/service-account.json') or os.path.exists('firebase-service-account.json')):
             raise RuntimeError(
                "❌ Missing Firebase configuration: Environment variables or JSON file required."
            )
    
    logger.info("✅ Firebase configuration validated")

