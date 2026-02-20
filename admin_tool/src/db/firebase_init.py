"""
Firebase Admin SDK initialization for the Admin Console.

Uses structured logging instead of print(). Handles both local
(service account JSON) and Cloud Run (Application Default Credentials) environments.
"""
import logging
import os

import firebase_admin
from firebase_admin import credentials, firestore

logger = logging.getLogger(__name__)


def _get_storage_bucket() -> str | None:
    """Read storage bucket name from environment."""
    bucket = os.getenv("FIREBASE_STORAGE_BUCKET", "")
    return bucket or None


def init_firebase() -> None:
    """
    Initialize Firebase Admin SDK (idempotent — safe to call multiple times).

    Order of credential resolution:
    1. FIREBASE_CREDENTIALS env var → path to service account JSON
    2. Default JSON filename 'firebase-service-account.json' in CWD
    3. Application Default Credentials (Cloud Run / gcloud auth)
    """
    if firebase_admin._apps:
        return  # Already initialized

    options: dict = {}
    bucket = _get_storage_bucket()
    if bucket:
        options["storageBucket"] = bucket

    cred_path = os.getenv("FIREBASE_CREDENTIALS", "firebase-service-account.json")

    try:
        if os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred, options)
            logger.info("Firebase initialized with service account.", extra={"cred_path": cred_path})
        else:
            # Cloud Run / Application Default Credentials
            firebase_admin.initialize_app(options=options)
            logger.info("Firebase initialized with Application Default Credentials.")
    except Exception:
        logger.exception("Firebase initialization failed.")
        raise


def get_db() -> firestore.Client:
    """Return initialized Firestore client."""
    init_firebase()
    return firestore.client()
