"""
Centralized Firebase Storage client.

Ensures Storage uses the same credentials as Firestore,
preventing authentication inconsistencies.
"""
import os
import logging
from google.cloud import storage
from src.db.firebase_client import _init_firebase
import firebase_admin

logger = logging.getLogger(__name__)

def get_storage_client() -> storage.Client:
    """
    Get Google Cloud Storage client using Firebase Admin credentials.
    
    Returns:
        storage.Client: Authenticated Storage client
        
    Raises:
        ValueError: If Firebase is not properly initialized
    """
    # Ensure Firebase Admin SDK is initialized
    _init_firebase()
    
    # Get the Firebase Admin app instance
    try:
        app = firebase_admin.get_app()
    except ValueError:
        raise ValueError("Firebase Admin app not initialized. Call _init_firebase() first.")
    
    # Create Storage client using Firebase Admin credentials
    # This ensures Storage and Firestore use the same authentication
    client = storage.Client(
        credentials=app.credential.get_credential(),
        project=app.project_id
    )
    
    logger.info(f"Storage client initialized for project: {app.project_id}")
    return client
