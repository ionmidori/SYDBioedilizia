"""
Read-only Firestore operations for Projects (Dashboard).
"""
import logging

from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import PROJECTS_COLLECTION
from src.models.project import (
    DEFAULT_CHAT_TITLE,
    Address,
    ProjectDetails,
    ProjectDocument,
    ProjectStatus,
    PropertyType,
)
from src.utils.serialization import parse_enum, parse_firestore_datetime

logger = logging.getLogger(__name__)


async def get_project(session_id: str, user_id: str) -> ProjectDocument | None:
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

        data = doc.to_dict() or {}

        # Ownership check
        if data.get("userId") != user_id:
            logger.warning(f"[Projects] User {user_id} not authorized for project {session_id}")
            return None

        # Handle datetime conversion
        created_at = parse_firestore_datetime(data.get("createdAt"))
        parse_firestore_datetime(data.get("updatedAt"))

        # Parse construction details if present
        construction_details = None
        if "constructionDetails" in data and data["constructionDetails"]:
            details_data = data["constructionDetails"]
            try:
                # L5 FIX: Validate address fields before constructing
                address_data = details_data.get("address") or {}
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
            except Exception as parse_error:  # noqa: BLE001 — legacy docs may hold any shape here
                logger.warning(f"[Projects] Error parsing construction details: {str(parse_error)}")

        return ProjectDocument(
            session_id=doc.id,
            user_id=data.get("userId", ""),
            title=data.get("title", DEFAULT_CHAT_TITLE),
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
