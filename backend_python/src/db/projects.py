"""
Firestore operations for Projects (Dashboard).

This module provides async functions to manage projects in Firestore.
Projects are stored in the `sessions` collection with extended schema.
"""
import logging
import uuid
from typing import List, Optional
from datetime import datetime
from google.cloud.firestore_v1 import FieldFilter
from firebase_admin import firestore

from src.db.firebase_client import get_async_firestore_client, get_storage_client
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
        
        print(f"DEBUG: get_user_projects called for user {user_id}")
        query = (
            db.collection(PROJECTS_COLLECTION)
            .where(filter=FieldFilter("userId", "==", user_id))
            # .order_by("updatedAt", direction="DESCENDING")
            .limit(limit)
        )
        
        docs = query.stream()
        projects = []
        
        async for doc in docs:
            data = doc.to_dict()
            
            # Handle datetime conversion (Firestore returns DatetimeWithNanoseconds)
            updated_at = data.get("updatedAt")
            if hasattr(updated_at, "to_datetime"):
                updated_at = updated_at.to_datetime()
            elif hasattr(updated_at, "isoformat"):
                 # Fallback for other objects with isoformat
                 pass
            else:
                updated_at = datetime.utcnow()
            
            # Safe status conversion
            raw_status = data.get("status", "draft")
            try:
                status_enum = ProjectStatus(raw_status)
            except ValueError:
                logger.warning(f"Invalid status '{raw_status}' for project {doc.id}, defaulting to DRAFT")
                status_enum = ProjectStatus.DRAFT

            projects.append(ProjectListItem(
                session_id=doc.id,
                title=data.get("title", "Nuovo Progetto"),
                status=status_enum,
                thumbnail_url=data.get("thumbnailUrl"),
                original_image_url=data.get("originalImageUrl"),
                updated_at=updated_at,
                message_count=data.get("messageCount", 0),
            ))
        
        logger.info(f"[Projects] Retrieved {len(projects)} projects for user {user_id}")
        return projects
        
    except Exception as e:
        print(f"DEBUG ERROR: get_user_projects failed: {str(e)}")
        logger.error(f"[Projects] Error fetching projects: {str(e)}", exc_info=True)
        return []


async def count_user_projects(user_id: str) -> int:
    """
    Count the number of projects owned by a user.
    
    Args:
        user_id: Firebase UID.
    
    Returns:
        Number of projects.
    """
    try:
        db = get_async_firestore_client()
        query = (
            db.collection(PROJECTS_COLLECTION)
            .where(filter=FieldFilter("userId", "==", user_id))
        )
        
        # Use aggregation query if available (more efficient)
        # Using count() aggregation is standard in newer value
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
        created_at = data.get("createdAt", datetime.utcnow())
        updated_at = data.get("updatedAt", datetime.utcnow())
        
        # Parse construction details if present
        construction_details = None
        if "constructionDetails" in data and data["constructionDetails"]:
            details_data = data["constructionDetails"]
            try:
                construction_details = ProjectDetails(
                    id=details_data.get("id", session_id),
                    footage_sqm=details_data.get("footage_sqm", 0),
                    property_type=PropertyType(details_data.get("property_type", "apartment")),
                    address=Address(**details_data.get("address", {})),
                    budget_cap=details_data.get("budget_cap", 0),
                    technical_notes=details_data.get("technical_notes"),
                    renovation_constraints=details_data.get("renovation_constraints", []),
                )
            except Exception as parse_error:
                logger.warning(f"[Projects] Error parsing construction details: {str(parse_error)}")
        
        return ProjectDocument(
            session_id=doc.id,
            user_id=data.get("userId", ""),
            title=data.get("title", "Nuovo Progetto"),
            status=ProjectStatus(data.get("status", "draft")),
            thumbnail_url=data.get("thumbnailUrl"),
            original_image_url=data.get("originalImageUrl"),
            message_count=data.get("messageCount", 0),
            created_at=created_at,
            updated_at=updated_at,
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
        
        await doc_ref.set({
            "sessionId": session_id,
            "userId": user_id,
            "title": data.title,
            "status": ProjectStatus.DRAFT.value,
            "thumbnailUrl": None,
            "messageCount": 0,
            "createdAt": datetime.utcnow(),
            "updatedAt": datetime.utcnow(),
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
        update_data = {"updatedAt": datetime.utcnow()}
        
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
            batch.set(project_ref, {"name": update_data["title"], "updatedAt": datetime.utcnow()}, merge=True)
            
        await batch.commit()
        
        logger.info(f"[Projects] Updated project {session_id} (and synced name)")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error updating project {session_id}: {str(e)}", exc_info=True)
        return False


async def claim_project(session_id: str, new_user_id: str) -> bool:
    """
    Transfer ownership of a guest project to a registered user (Deferred Auth).
    
    Args:
        session_id: Project ID (currently owned by guest_*).
        new_user_id: Firebase UID of the newly registered user.
    
    Returns:
        True if claimed successfully.
    """
    try:
        db = get_async_firestore_client()
        
        doc_ref = db.collection(PROJECTS_COLLECTION).document(session_id)
        doc = await doc_ref.get()
        
        if not doc.exists:
            logger.warning(f"[Projects] Cannot claim non-existent project {session_id}")
            return False
        
        current_owner = doc.to_dict().get("userId", "")
        
        # Only allow claiming if current owner is a guest
        if not current_owner.startswith("guest_"):
            logger.warning(f"[Projects] Project {session_id} is not a guest project")
            return False
        
        await doc_ref.update({
            "userId": new_user_id,
            "updatedAt": datetime.utcnow(),
        })
        
        logger.info(f"[Projects] Claimed project {session_id} for user {new_user_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error claiming project {session_id}: {str(e)}", exc_info=True)
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
            "property_type": details.property_type.value,
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
            "updatedAt": datetime.utcnow(),
        })
        
        logger.info(f"[Projects] Updated construction details for project {session_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error updating project details {session_id}: {str(e)}", exc_info=True)
        return False




# ... (Previous code) ... 

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

        # 2. Delete Firebase Storage Blobs
        try:
            bucket = get_storage_client()
            
            # Path A: Backend Generator
            prefix_backend = f"user-uploads/{session_id}/"
            blobs_backend = list(bucket.list_blobs(prefix=prefix_backend))
            if blobs_backend:
                bucket.delete_blobs(blobs_backend)
            
            # Path B: Frontend Uploader
            prefix_frontend = f"projects/{session_id}/uploads/"
            blobs_frontend = list(bucket.list_blobs(prefix=prefix_frontend))
            if blobs_frontend:
                bucket.delete_blobs(blobs_frontend)
                
            # Path C: Backend Renders (Deep Delete)
            prefix_renders = f"renders/{session_id}/"
            blobs_renders = list(bucket.list_blobs(prefix=prefix_renders))
            if blobs_renders:
                bucket.delete_blobs(blobs_renders)
                
            # Path D: Backend Documents (Deep Delete)
            prefix_docs = f"documents/{session_id}/"
            blobs_docs = list(bucket.list_blobs(prefix=prefix_docs))
            if blobs_docs:
                bucket.delete_blobs(blobs_docs)
                
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
                "updatedAt": datetime.utcnow()
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
                 "updatedAt": datetime.utcnow()
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
