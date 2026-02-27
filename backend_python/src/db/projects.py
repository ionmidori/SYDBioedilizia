"""
Firestore operations for Projects (Dashboard).

This module provides async functions to manage projects in Firestore.
Projects are stored in the `sessions` collection with extended schema.
"""
import logging
import uuid
from typing import List, Optional
from datetime import datetime
from src.utils.datetime_utils import utc_now
from google.cloud.firestore_v1 import FieldFilter
from firebase_admin import firestore

from src.db.firebase_client import get_async_firestore_client, get_storage_client
from starlette.concurrency import run_in_threadpool
from src.models.project import (
    ProjectCreate,
    ProjectDocument,
    ProjectListItem,
    ProjectStatus,
    ProjectUpdate,
    ProjectDetails,
    Address,
    PropertyType,
)
from src.utils.serialization import parse_firestore_datetime, parse_enum

logger = logging.getLogger(__name__)

# Collection name (we extend "sessions" to serve as "projects")
PROJECTS_COLLECTION = "sessions"


async def get_user_projects(user_id: str, limit: int = 50) -> List[ProjectListItem]:
    """
    Retrieve all projects for a user, ordered by last activity.
    
    Args:
        user_id: Firebase UID of the owner.
        limit: Maximum number of projects to return.
    
    Returns:
        List of ProjectListItem for dashboard display.
    """
    try:
        db = get_async_firestore_client()
        query = (
            db.collection(PROJECTS_COLLECTION)
            .where(filter=FieldFilter("userId", "==", user_id))
            .order_by("updatedAt", direction="DESCENDING")
            .limit(limit)
        )
        
        docs = query.stream()
        projects = []
        
        async for doc in docs:
            data = doc.to_dict()
            
            # Robust Parsing via Utility
            updated_at = parse_firestore_datetime(data.get("updatedAt"))
            
            # Safe status conversion
            status_enum = parse_enum(ProjectStatus, data.get("status"), ProjectStatus.DRAFT)

            try:
                projects.append(ProjectListItem(
                    session_id=doc.id,
                    title=data.get("title", "Nuovo Progetto"),
                    status=status_enum,
                    thumbnail_url=data.get("thumbnailUrl"),
                    original_image_url=data.get("originalImageUrl"),
                    updated_at=updated_at,
                    message_count=data.get("messageCount") or 0, 
                ))
            except Exception as item_error:
                logger.error(f"[Projects] Skipping Invalid Project {doc.id}: {item_error}")
                continue
        
        logger.info(f"[Projects] Retrieved {len(projects)} projects for user {user_id}")
        return projects
        
    except Exception as e:
        # Re-raise to let the router's exception handler log a proper error and return 500.
        # This is intentionally NOT silenced: query-level failures are critical and must be visible.
        logger.error(f"[Projects] Critical error fetching projects for user {user_id}: {str(e)}", exc_info=True)
        raise


async def count_user_projects(user_id: str) -> int:
    """
    Count the number of projects owned by a user.
    
    Args:
        user_id: Firebase UID.
    
    Returns:
        Number of projects.
    """
    db = get_async_firestore_client()
    # L2 FIX: Define query BEFORE try block so it's always in scope for fallback
    query = (
        db.collection(PROJECTS_COLLECTION)
        .where(filter=FieldFilter("userId", "==", user_id))
    )
    
    try:
        # Use aggregation query (more efficient)
        aggregate_query = query.count()
        results = await aggregate_query.get()
        return results[0][0].value
        
    except Exception as e:
        logger.error(f"[Projects] Error counting projects for {user_id}: {str(e)}")
        # Fallback in case aggregation fails (or older sdk)
        try:
            docs = query.select(['sessionId']).stream()
            count = 0
            async for _ in docs:
                count += 1
            return count
        except Exception as e2:
            logger.error(f"[Projects] Fallback count failed: {str(e2)}")
            return 0


async def get_project(session_id: str, user_id: str) -> Optional[ProjectDocument]:
    """
    Retrieve a single project by ID with ownership verification.
    
    Args:
        session_id: Project/Session ID.
        user_id: Firebase UID for ownership check.
    
    Returns:
        ProjectDocument if found and owned by user, None otherwise.
    """
    try:
        db = get_async_firestore_client()
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"[Projects] Project {session_id} not found")
            return None
        
        data = doc.to_dict()
        
        # Ownership check
        if data.get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized for project {session_id}")
            return None
        
        # Handle datetime conversion
        created_at = parse_firestore_datetime(data.get("createdAt"))
        updated_at = parse_firestore_datetime(data.get("updatedAt"))
        
        # Parse construction details if present
        construction_details = None
        if "constructionDetails" in data and data["constructionDetails"]:
            details_data = data["constructionDetails"]
            try:
                # L5 FIX: Validate address fields before constructing
                address_data = details_data.get("address", {})
                if not all(address_data.get(k) for k in ("street", "city", "zip")):
                    raise ValueError("Incomplete address data")
                
                # C5 FIX: Remove zombie defaults (0) — let Pydantic validate
                construction_details = ProjectDetails(
                    id=details_data.get("id", session_id),
                    footage_sqm=details_data["footage_sqm"],
                    property_type=parse_enum(PropertyType, details_data.get("property_type"), PropertyType.APARTMENT),
                    address=Address(**address_data),
                    budget_cap=details_data["budget_cap"],
                    technical_notes=details_data.get("technical_notes"),
                    renovation_constraints=details_data.get("renovation_constraints", []),
                )
            except Exception as parse_error:
                logger.warning(f"[Projects] Error parsing construction details: {str(parse_error)}")
        
        return ProjectDocument(
            session_id=doc.id,
            user_id=data.get("userId", ""),
            title=data.get("title", "Nuovo Progetto"),
            status=parse_enum(ProjectStatus, data.get("status"), ProjectStatus.DRAFT),
            thumbnail_url=data.get("thumbnailUrl"),
            original_image_url=data.get("originalImageUrl"),
            message_count=data.get("messageCount", 0),
            created_at=created_at,
            updated_at=parse_firestore_datetime(data.get("updatedAt")),
            construction_details=construction_details,
        )
        
    except Exception as e:
        logger.error(f"[Projects] Error fetching project {session_id}: {str(e)}", exc_info=True)
        return None


async def create_project(user_id: str, data: ProjectCreate) -> str:
    """
    Create a new project (session) for a user.
    
    Args:
        user_id: Firebase UID of the owner.
        data: Project creation request.
    
    Returns:
        The new session_id (document ID).
    """
    try:
        db = get_async_firestore_client()
        
        # Generate unique session ID
        session_id = str(uuid.uuid4())
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        
        # S1 FIX: Explicit null initialization for ALL fields
        await doc_ref.set({
            "sessionId": session_id,
            "userId": user_id,
            "title": data.title,
            "status": ProjectStatus.DRAFT.value,
            "thumbnailUrl": None,
            "originalImageUrl": None,
            "constructionDetails": None,
            "messageCount": 0,
            "createdAt": utc_now(),
            "updatedAt": utc_now(),
        })
        
        logger.info(f"[Projects] Created project {session_id} for user {user_id}")
        return session_id
        
    except Exception as e:
        logger.error(f"[Projects] Error creating project: {str(e)}", exc_info=True)
        raise Exception(f"Failed to create project: {str(e)}")


async def update_project(session_id: str, user_id: str, data: ProjectUpdate) -> bool:
    """
    Update project metadata (title, status, thumbnail).
    
    Args:
        session_id: Project ID.
        user_id: UID for ownership verification.
        data: Fields to update.
    
    Returns:
        True if updated, False if not found or unauthorized.
    """
    try:
        db = get_async_firestore_client()
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            return False
        
        # Ownership check
        if doc.to_dict().get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to update {session_id}")
            return False
        
        # Build update dict (only non-None fields)
        update_data = {"updatedAt": utc_now()}
        
        if data.title is not None:
            update_data["title"] = data.title
        if data.status is not None:
            update_data["status"] = data.status.value
        if data.thumbnail_url is not None:
            update_data["thumbnailUrl"] = data.thumbnail_url
        if data.original_image_url is not None:
            update_data["originalImageUrl"] = data.original_image_url
        
        # Update both collections
        batch = db.batch()
        batch.update(doc_ref, update_data)
        
        # Sync to 'projects' collection if title changed
        if "title" in update_data:
            project_ref = db.collection("projects").document(session_id)
            # We use set with merge to ensure it exists or update it
            batch.set(project_ref, {"name": update_data["title"], "updatedAt": utc_now()}, merge=True)
            
        await batch.commit()
        
        logger.info(f"[Projects] Updated project {session_id} (and synced name)")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error updating project {session_id}: {str(e)}", exc_info=True)
        return False


async def claim_project(session_id: str, new_user_id: str) -> bool:
    """
    Transfer ownership of a guest project to a registered user (Deep Claim).
    
    Args:
        session_id: Project ID (currently owned by guest_*).
        new_user_id: Firebase UID of the newly registered user.
    
    Returns:
        True if claimed successfully.
    """
    try:
        db = get_async_firestore_client()
        
        # 1. Verify Project (Source of Truth: sessions collection)
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"[Projects] Cannot claim non-existent project {session_id}")
            return False
        
        current_data = doc.to_dict()
        current_owner = current_data.get("userId", "")

        # Idempotent: already owned by this user → success (no-op)
        if current_owner == new_user_id:
            logger.info(f"[Projects] Project {session_id} already owned by {new_user_id}, skipping claim")
            return True

        # Only allow claiming if current owner is a guest
        if not current_owner.startswith("guest_"):
            logger.warning(f"[Projects] Project {session_id} is already owned by {current_owner}")
            return False
            
        # 2. Prepare Atomic Batch
        batch = db.batch()
        now = utc_now()
        
        # A. Update Session (Backend)
        batch.update(doc_ref, {
            "userId": new_user_id,
            "updatedAt": now,
        })
        
        # B. Update Project (Public Projection)
        public_ref = db.collection("projects").document(session_id)
        # Check if it exists before update, or use set(merge=True)
        batch.set(public_ref, {
            "userId": new_user_id,
            "updatedAt": now,
        }, merge=True)
        
        # 3. Deep Update: Files Metadata
        # We also need to update 'uploadedBy' in subcollections for strict delete rules
        files_subcol = public_ref.collection("files")
        async for file_doc in files_subcol.stream():
            batch.update(file_doc.reference, {
                "uploadedBy": new_user_id,
                "updatedAt": now
            })
            
        # 4. Commit Transition
        await batch.commit()
        
        logger.info(f"[Projects] DEEP CLAIM completed for project {session_id}. Owner: {new_user_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error during deep claim for {session_id}: {str(e)}", exc_info=True)
        return False


async def update_project_details(session_id: str, user_id: str, details: ProjectDetails) -> bool:
    """
    Update construction site details for a project.
    
    This stores comprehensive project information that serves as the 
    Single Source of Truth for AI context generation.
    
    Args:
        session_id: Project ID.
        user_id: UID for ownership verification.
        details: Construction site details to store.
    
    Returns:
        True if updated, False if not found or unauthorized.
    """
    try:
        db = get_async_firestore_client()
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"[Projects] Cannot update details for non-existent project {session_id}")
            return False
        
        # Ownership check
        if doc.to_dict().get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to update details for {session_id}")
            return False
        
        # Convert Pydantic model to dict for Firestore
        details_dict = {
            "id": details.id,
            "footage_sqm": details.footage_sqm,
            "property_type": details.property_type,
            "address": {
                "street": details.address.street,
                "city": details.address.city,
                "zip": details.address.zip,
            },
            "budget_cap": details.budget_cap,
            "technical_notes": details.technical_notes,
            "renovation_constraints": details.renovation_constraints,
        }
        
        await doc_ref.update({
            "constructionDetails": details_dict,
            "updatedAt": utc_now(),
        })
        
        logger.info(f"[Projects] Updated construction details for project {session_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error updating project details {session_id}: {str(e)}", exc_info=True)
        return False


async def save_project_file_metadata(session_id: str, user_id: str, file_metadata: dict) -> bool:
    """
    Save metadata for an uploaded file to the project's 'files' subcollection.
    
    Args:
        session_id: Project ID.
        user_id: UID for ownership verification.
        file_metadata: Dictionary containing file details (url, name, type, size, etc.).
        
    Returns:
        True if saved successfully, False if project not found or unauthorized.
    """
    try:
        db = get_async_firestore_client()
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"[Projects] Cannot save file metadata for non-existent project {session_id}")
            return False
            
        # Ownership check
        if doc.to_dict().get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to save file to {session_id}")
            return False
            
        file_id = file_metadata.get("file_id")
        if not file_id:
            logger.error("[Projects] file_id is required in file_metadata")
            return False
            
        # Prepare the document data
        doc_data = {
            "url": file_metadata.get("url"),
            "name": file_metadata.get("name"),
            "type": file_metadata.get("type"),
            "size": file_metadata.get("size"),
            "uploadedAt": utc_now(),
            "uploadedBy": user_id,
            "projectId": session_id
        }
        
        # Save to the 'files' subcollection
        files_ref = doc_ref.collection("files").document(file_id)
        await files_ref.set(doc_data)
        
        # Also update the project's updatedAt timestamp
        await doc_ref.update({"updatedAt": utc_now()})
        
        logger.info(f"[Projects] Saved file metadata {file_id} for project {session_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error saving file metadata for {session_id}: {str(e)}", exc_info=True)
        return False


async def _delete_storage_blobs(bucket, prefix: str) -> int:
    """
    Delete all blobs under a storage prefix without blocking the event loop.
    
    S5 FIX: Uses run_in_threadpool to wrap the synchronous GCS SDK calls
    (list_blobs, delete_blobs) which would otherwise block the FastAPI
    event loop during project deletion.
    
    Args:
        bucket: GCS bucket instance
        prefix: Storage path prefix to delete
        
    Returns:
        Number of blobs deleted
    """
    blobs = await run_in_threadpool(lambda: list(bucket.list_blobs(prefix=prefix)))
    if blobs:
        await run_in_threadpool(bucket.delete_blobs, blobs)
    return len(blobs)


async def delete_project(session_id: str, user_id: str) -> bool:
    """
    Delete a project and all its associated data (messages, files, storage blobs).
    """
    try:
        db = get_async_firestore_client()
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"[Projects] Cannot delete non-existent project {session_id}")
            return False
        
        # Ownership check
        if doc.to_dict().get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized to delete {session_id}")
            return False
        
        # 1. Clean up Firestore Subcollections (Deep Delete)
        # A. Backend 'sessions' collection
        subcollections = ["messages", "files"]
        for subcol_name in subcollections:
            subcol_ref = doc_ref.collection(subcol_name)
            await _delete_collection_batch(db, subcol_ref)
            
        # B. Frontend 'projects' collection
        frontend_project_ref = db.collection("projects").document(session_id)
        await _delete_collection_batch(db, frontend_project_ref.collection("files"))
        await frontend_project_ref.delete()

        # 2. Delete Firebase Storage Blobs (S5 FIX: non-blocking)
        try:
            bucket = get_storage_client()
            
            storage_prefixes = [
                f"user-uploads/{session_id}/",   # Backend Generator
                f"projects/{session_id}/uploads/",  # Frontend Uploader
                f"renders/{session_id}/",           # Backend Renders
                f"documents/{session_id}/",         # Backend Documents
            ]
            
            for prefix in storage_prefixes:
                await _delete_storage_blobs(bucket, prefix)
                
            logger.info(f"[Projects] Deep delete: Storage cleaned for {session_id}")
                
        except Exception as storage_e:
            logger.error(f"[Projects] Storage cleanup warning for {session_id}: {storage_e}")

        # 3. Delete Project Document (Backend)
        await doc_ref.delete()
        
        logger.info(f"[Projects] DEEP DELETE completed for {session_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error deleting project {session_id}: {str(e)}", exc_info=True)
        return False


async def sync_project_cover(session_id: str) -> bool:
    """
    Scans the project's 'files' container to determine the best cover.
    
    Priority:
    1. Latest Render (Before/After) - if 'source_image_id' present
    2. Latest Render (Single)
    3. First uploaded Photo
    4. First uploaded Video
    
    Args:
        session_id: Project ID.
        
    Returns:
        True if the cover was updated.
    """
    try:
        db = get_async_firestore_client()
        files_ref = db.collection('projects').document(session_id).collection('files')
        
        # Get all files (we expect small number < 100 for now)
        # Sort by uploadedAt descending to find latest easily
        # Note: In async client, order_by needs await logic or stream
        docs = files_ref.order_by('uploadedAt', direction='DESCENDING').stream()
        
        files = []
        async for doc in docs:
            files.append(doc.to_dict())
            
        if not files:
            return False
            
        new_thumbnail = None
        new_original = None
        
        # 1. Look for renders (Latest first)
        renders = [f for f in files if f.get('type') == 'render']
        if renders:
            latest_render = renders[0]
            new_thumbnail = latest_render.get('url')
            
            # Check for source image id in metadata
            meta = latest_render.get('metadata', {})
            source_id = meta.get('source_image_id')
            if source_id:
                # Ideally source_id IS the URL if we set it that way. 
                # Let's verify if it's a URL or ID. In generate_render we set it as source_image_url.
                if source_id.startswith('http'):
                    new_original = source_id
                else:
                    # Find the file with that ID/Name? For now assume it's URL.
                    pass
        
        # 2. If no renders, look for Photos (Oldest/First first? Or Latest?)
        # User said "create project and upload photo -> cover". Usually "First" uploaded is cover?
        # Or "Latest" uploaded?
        # User said: "se c'è una foto... applicala... se ce ne sono più, ne scegli una".
        # Let's pick the *First* uploaded photo to keep it stable, or *Latest* if we want dynamic?
        # User said: "project cover udpates after... uploaded". Implies the NEW one becomes cover?
        # Let's stick with LATEST for now as it feels more responsive.
        if not new_thumbnail:
            images = [f for f in files if f.get('type') == 'image']
            if images:
                # Files are sorted DESC (Latest first)
                new_thumbnail = images[0].get('url')
        
        # 3. If no images, look for Video
        if not new_thumbnail:
            videos = [f for f in files if f.get('type') == 'video']
            if videos:
                # Use a specific thumbnail field or fallback
                new_thumbnail = videos[0].get('thumbnailUrl')
        
        if not new_thumbnail:
            return False
            
        # Update Project
        # Retrieve current project to check if update needed
        project_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        project_doc = await project_ref.get()
        if not project_doc.exists:
             return False
             
        current_data = project_doc.to_dict()
        
        # Only update if different
        if (current_data.get('thumbnailUrl') != new_thumbnail or 
            current_data.get('originalImageUrl') != new_original):
            
            update_payload = {
                "thumbnailUrl": new_thumbnail,
                "originalImageUrl": new_original, # Can be None, which deletes it (FieldValue.delete())? No, None just sets null.
                "updatedAt": utc_now()
            }
            
            # Use dot notation or FieldValue.delete() if we want to remove fields? for now set null is fine (Pydantic allows optional)
            
            # Update Session
            await project_ref.update(update_payload)
            
            # Update 'projects' collection (public view)
            # Only thumbnail is needed there? Original image url for hover? We added it to Pydantic/Frontend types.
            # But 'projects' collection schema might be loose.
            public_ref = db.collection('projects').document(session_id)
            await public_ref.set({
                 "thumbnailUrl": new_thumbnail,
                 "originalImageUrl": new_original,
                 "updatedAt": utc_now()
            }, merge=True)
            
            logger.info(f"[Projects] 🖼️ Smart Cover: Updated {session_id} -> {new_thumbnail}")
            return True
            
        return False
    except Exception as e:
        logger.error(f"[Projects] Error syncing cover for {session_id}: {str(e)}", exc_info=True)
        return False


async def _delete_collection_batch(db, coll_ref, batch_size=50):
    """
    Helper to delete a collection in batches.
    """
    # Use list() to consume stream immediately
    docs = [d async for d in coll_ref.limit(batch_size).stream()]
    
    if not docs:
        return 0
        
    batch = db.batch()
    for doc in docs:
        batch.delete(doc.reference)
    await batch.commit()
    
    deleted = len(docs)
    
    if deleted >= batch_size:
        return deleted + await _delete_collection_batch(db, coll_ref, batch_size)
    return deleted
