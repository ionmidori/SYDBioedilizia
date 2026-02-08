"""
Projects API Router for Dashboard.

Provides REST endpoints for project management:
- List user projects
- Get project details
- Create new project
- Update project metadata
- Claim guest project (Deferred Auth)
"""
from fastapi import APIRouter, HTTPException, Depends, status
from typing import List
import logging

from src.auth.jwt_handler import verify_token
from src.schemas.internal import UserSession
from src.db import projects as projects_db
from src.models.project import (
    ProjectCreate,
    ProjectDocument,
    ProjectListItem,
    ProjectUpdate,
    ProjectDetails,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.get("", response_model=List[ProjectListItem])
async def list_projects(
    user_session: UserSession = Depends(verify_token)
) -> List[ProjectListItem]:
    """
    List all projects for the authenticated user.
    
    Returns:
        List of projects ordered by last activity.
    """
    user_id = user_session.uid
    
    projects = await projects_db.get_user_projects(user_id)
    return projects


@router.get("/{session_id}", response_model=ProjectDocument)
async def get_project(
    session_id: str,
    user_session: UserSession = Depends(verify_token)
) -> ProjectDocument:
    """
    Get detailed project information.
    
    Args:
        session_id: Project ID.
    
    Returns:
        Full project document.
    
    Raises:
        404: Project not found or not owned by user.
    """
    user_id = user_session.uid
    logger.info(f"[API] get_project request for session_id: {session_id} from user_id: {user_id}")
    
    project = await projects_db.get_project(session_id, user_id)
    
    if (not project):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="PROGETTO_NON_TROVATO_BACKEND"
        )
    
    return project


@router.post("", response_model=dict)
async def create_project(
    data: ProjectCreate,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Create a new project.
    
    Args:
        data: Project creation data (title).
    
    Returns:
        Object with session_id of the new project.
    """
    user_id = user_session.uid
    logger.info(f"[API] create_project request from user_id: {user_id} with data: {data}")
    
    try:
        # 🛡️ PROJECT LIMIT CHECK
        # Max 5 projects per user
        current_count = await projects_db.count_user_projects(user_id)
        if current_count >= 5:
            logger.warning(f"[API] User {user_id} reached project limit ({current_count}/5)")
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="🚫 Hai raggiunto il limite massimo di 5 progetti. Elimina un vecchio progetto per crearne uno nuovo."
            )

        session_id = await projects_db.create_project(user_id, data)
        logger.info(f"[API] Created project {session_id} for user {user_id}")
        return {"session_id": session_id}
    
    except Exception as e:
        logger.error(f"[API] Failed to create project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Impossibile creare il progetto"
        )


@router.patch("/{session_id}", response_model=dict)
async def update_project(
    session_id: str,
    data: ProjectUpdate,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Update project metadata (title, status, thumbnail).
    
    Args:
        session_id: Project ID.
        data: Fields to update.
    
    Returns:
        Success status.
    """
    user_id = user_session.uid
    
    success = await projects_db.update_project(session_id, user_id, data)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progetto non trovato o non autorizzato"
        )
    
    return {"success": True}


@router.post("/{session_id}/claim", response_model=dict)
async def claim_project(
    session_id: str,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Claim a guest project (Deferred Auth).
    
    Transfers ownership from guest_* to the authenticated user.
    
    Args:
        session_id: Project ID with guest ownership.
    
    Returns:
        Success status.
    """
    user_id = user_session.uid
    
    success = await projects_db.claim_project(session_id, user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossibile reclamare il progetto (non trovato o già assegnato)"
        )
    
    logger.info(f"[API] User {user_id} claimed project {session_id}")
    return {"success": True, "message": "Progetto reclamato con successo"}


@router.patch("/{session_id}/details", response_model=dict)
async def update_project_details(
    session_id: str,
    details: ProjectDetails,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Update construction site details for a project.
    
    This endpoint stores comprehensive project information that serves as
    the Single Source of Truth for AI context generation.
    
    Args:
        session_id: Project ID.
        details: Construction site details (footage, property type, address, budget, etc.).
    
    Returns:
        Success status.
    
    Raises:
        404: Project not found or not owned by user.
        422: Validation error (handled by Pydantic).
    """
    user_id = user_session.uid
    logger.info(f"[API] update_project_details request for session_id: {session_id} from user_id: {user_id}")
    
    # Ensure the details ID matches the session_id
    if details.id != session_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Project details ID must match session ID"
        )
    
    success = await projects_db.update_project_details(session_id, user_id, details)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progetto non trovato o non autorizzato"
        )
    
    logger.info(f"[API] Successfully updated construction details for project {session_id}")
    return {"success": True, "message": "Dettagli del cantiere aggiornati con successo"}


@router.delete("/{session_id}", response_model=dict)
async def delete_project(
    session_id: str,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Delete a project and all its associated data.
    
    This is a destructive operation that:
    - Deletes all chat messages (messages subcollection)
    - Deletes the project document
    
    Args:
        session_id: Project ID to delete.
    
    Returns:
        Success status.
    
    Raises:
        404: Project not found or not owned by user.
    """
    user_id = user_session.uid
    logger.info(f"[API] delete_project request for session_id: {session_id} from user_id: {user_id}")
    
    success = await projects_db.delete_project(session_id, user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progetto non trovato o non autorizzato"
        )
    
    logger.info(f"[API] Successfully deleted project {session_id} for user {user_id}")
    return {"success": True, "message": "Progetto eliminato con successo"}
