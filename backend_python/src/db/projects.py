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

from src.db.firebase_client import get_async_firestore_client
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
            
            projects.append(ProjectListItem(
                session_id=doc.id,
                title=data.get("title", "Nuovo Progetto"),
                status=ProjectStatus(data.get("status", "draft")),
                thumbnail_url=data.get("thumbnailUrl"),
                updated_at=updated_at,
                message_count=data.get("messageCount", 0),
            ))
        
        logger.info(f"[Projects] Retrieved {len(projects)} projects for user {user_id}")
        return projects
        
    except Exception as e:
        print(f"DEBUG ERROR: get_user_projects failed: {str(e)}")
        logger.error(f"[Projects] Error fetching projects: {str(e)}", exc_info=True)
        return []


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
        
        await doc_ref.update(update_data)
        
        logger.info(f"[Projects] Updated project {session_id}")
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


async def delete_project(session_id: str, user_id: str) -> bool:
    """
    Delete a project and all its associated data (messages subcollection).
    
    Args:
        session_id: Project ID to delete.
        user_id: UID for ownership verification.
    
    Returns:
        True if deleted successfully, False if not found or unauthorized.
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
        
        # Delete all messages in the subcollection
        messages_ref = doc_ref.collection("messages")
        
        # Firestore doesn't support deleting collections directly in async client
        # We need to delete documents in batches
        batch_size = 100
        deleted_count = 0
        
        while True:
            # Get a batch of messages
            messages_query = messages_ref.limit(batch_size)
            docs = messages_query.stream()
            
            # Collect document references
            doc_refs_to_delete = []
            async for msg_doc in docs:
                doc_refs_to_delete.append(msg_doc.reference)
            
            # If no more documents, break
            if not doc_refs_to_delete:
                break
            
            # Delete in batch
            batch = db.batch()
            for msg_ref in doc_refs_to_delete:
                batch.delete(msg_ref)
            
            await batch.commit()
            deleted_count += len(doc_refs_to_delete)
            
            logger.info(f"[Projects] Deleted {len(doc_refs_to_delete)} messages from {session_id}")
        
        # Finally, delete the project document itself
        await doc_ref.delete()
        
        logger.info(f"[Projects] Deleted project {session_id} (with {deleted_count} messages) for user {user_id}")
        return True
        
    except Exception as e:
        logger.error(f"[Projects] Error deleting project {session_id}: {str(e)}", exc_info=True)
        return False
