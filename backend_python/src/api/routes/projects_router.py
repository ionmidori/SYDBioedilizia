"""
Projects API Router for Dashboard.

Provides REST endpoints for project management:
- List user projects
- Get project details
- Create new project
- Update project metadata
- Claim guest project (Deferred Auth)
- Rooms of a project and the room of each file (Phase 138)
"""
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path, status
from src.auth.jwt_handler import verify_token
from src.db import projects as projects_db
from src.db.firebase_client import get_async_firestore_client
from src.db.projects.mutations import is_dashboard_upload_path
from src.models.project import (
    ProjectCreate,
    ProjectDetails,
    ProjectDocument,
    ProjectFileMetadata,
    ProjectListItem,
    ProjectUpdate,
)
from src.repositories.room_repository import get_room_repository
from src.schemas.internal import UserSession
from src.schemas.room import ROOM_ID_PATTERN, FileRoomUpdate, RoomCreate, RoomSchema, RoomUpdate
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/projects", tags=["projects"])


async def _require_owned_project(session_id: str, user_id: str) -> Any:
    """Reference of a project owned by the user: 404 if missing, 403 if someone else's."""
    project_ref = get_async_firestore_client().collection("projects").document(session_id)
    project_doc = await project_ref.get()
    if not project_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Progetto non trovato")

    project_data = project_doc.to_dict() or {}
    if project_data.get("userId") != user_id and project_data.get("user_id") != user_id:
        logger.warning(
            f"[API] User {user_id} denied access to project {session_id} "
            f"owned by {project_data.get('userId') or project_data.get('user_id')}"
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accesso negato")
    return project_ref


@router.get("", response_model=list[ProjectListItem])
async def list_projects(
    user_session: UserSession = Depends(verify_token)
) -> list[ProjectListItem]:
    """
    List all projects for the authenticated user.

    Returns:
        List of projects ordered by last activity.
    """
    try:
        user_id = user_session.uid
        logger.info(f"[API] Listing projects for user_id: {user_id}")

        projects = await projects_db.get_user_projects(user_id)

        # DEBUG: Log count
        logger.info(f"[API] Found {len(projects)} projects")
        return projects
    except Exception as e:
        logger.error(f"[API] Error in list_projects: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Impossibile caricare i progetti"
        ) from e


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
        emit_audit_event(AuditAction.PROJECT_CREATE, AuditResourceType.PROJECT, session_id, user_id=user_id)
        return {"session_id": session_id}

    # S4 FIX: Let HTTPExceptions (e.g. 403 limit) pass through
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[API] Failed to create project: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Impossibile creare il progetto"
        ) from e


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

    success = await projects_db.claim_project(session_id, user_id, is_guest=user_session.is_guest)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Impossibile reclamare il progetto (non trovato o già assegnato)"
        )

    logger.info(f"[API] User {user_id} claimed project {session_id}")
    emit_audit_event(AuditAction.PROJECT_CLAIM, AuditResourceType.PROJECT, session_id, user_id=user_id)
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


@router.post("/{session_id}/files", response_model=dict)
async def add_project_file(
    session_id: str,
    file_metadata: ProjectFileMetadata,
    user_session: UserSession = Depends(verify_token)
) -> dict:
    """
    Add file metadata to a project after a successful upload.
    """
    user_id = user_session.uid
    logger.info(f"[API] add_project_file request for session_id: {session_id} from user_id: {user_id}")

    # An explicit path into another project is a client error (a path only read
    # from the URL is dropped by save_project_file_metadata with the same rule).
    if file_metadata.storage_path is not None and not is_dashboard_upload_path(session_id, file_metadata.storage_path):
        raise HTTPException(status_code=422, detail="storage_path non valido")
    if file_metadata.room_id is not None:
        await _require_owned_project(session_id, user_id)
        await get_room_repository().require_room(session_id, file_metadata.room_id)

    success = await projects_db.save_project_file_metadata(
        session_id=session_id,
        user_id=user_id,
        file_metadata=file_metadata.model_dump()
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progetto non trovato o non autorizzato"
        )

    return {"success": True, "message": "Metadati file salvati con successo"}


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

    success = await projects_db.soft_delete_project(session_id, user_id)

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Progetto non trovato o non autorizzato"
        )

    logger.info(f"[API] Soft-deleted project {session_id} for user {user_id}")
    emit_audit_event(AuditAction.PROJECT_SOFT_DELETE, AuditResourceType.PROJECT, session_id, user_id=user_id)
    return {"success": True, "message": "Progetto eliminato con successo"}


@router.delete("/{session_id}/files/{file_id}", response_model=dict)
async def delete_project_file(
    session_id: str,
    file_id: str,
    user_session: UserSession = Depends(verify_token),
) -> dict:
    """
    Delete a single file from a project's files subcollection.
    Enforces ownership via JWT — delegates all auth to verify_token.
    """
    user_id = user_session.uid
    project_ref = await _require_owned_project(session_id, user_id)

    # Verify file exists
    file_ref = project_ref.collection("files").document(file_id)
    file_doc = await file_ref.get()
    if not file_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File non trovato")

    await file_ref.delete()
    logger.info(f"[API] Deleted file {file_id} from project {session_id} for user {user_id}")
    emit_audit_event(
        AuditAction.FILE_DELETE, AuditResourceType.FILE, file_id,
        user_id=user_id, metadata={"project_id": session_id},
    )
    return {"success": True}


# ── Rooms (Phase 138) ─────────────────────────────────────────────────────────


@router.get("/{session_id}/rooms", response_model=list[RoomSchema])
async def list_rooms(
    session_id: str,
    user_session: UserSession = Depends(verify_token),
) -> list[RoomSchema]:
    """Rooms of the project in creation order.

    A project without rooms (created before Phase 138) gets the "Generale"
    room on this first access, holding all its files.
    """
    await _require_owned_project(session_id, user_session.uid)
    repo = get_room_repository()
    rooms = await repo.list_rooms(session_id)
    return rooms or [await repo.ensure_default_room(session_id)]


@router.post("/{session_id}/rooms", response_model=RoomSchema, status_code=status.HTTP_201_CREATED)
async def create_room(
    session_id: str,
    data: RoomCreate,
    user_session: UserSession = Depends(verify_token),
) -> RoomSchema:
    """Add a room to the project (409 past the per-project limit)."""
    await _require_owned_project(session_id, user_session.uid)
    return await get_room_repository().create_room(session_id, data)


@router.patch("/{session_id}/rooms/{room_id}", response_model=RoomSchema)
async def update_room(
    session_id: str,
    data: RoomUpdate,
    room_id: str = Path(pattern=ROOM_ID_PATTERN),
    user_session: UserSession = Depends(verify_token),
) -> RoomSchema:
    """Rename a room and/or change its type (404 if it is not a room of the project)."""
    await _require_owned_project(session_id, user_session.uid)
    return await get_room_repository().update_room(session_id, room_id, data)


@router.patch("/{session_id}/files/{file_id}", response_model=dict)
async def assign_file_room(
    session_id: str,
    file_id: str,
    data: FileRoomUpdate,
    user_session: UserSession = Depends(verify_token),
) -> dict:
    """Move a project file to another room of the same project."""
    await _require_owned_project(session_id, user_session.uid)
    await get_room_repository().assign_file_to_room(session_id, file_id, data.room_id)
    return {"success": True}
