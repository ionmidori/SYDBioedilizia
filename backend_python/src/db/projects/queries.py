"""
Read-only Firestore operations for Projects (Dashboard).
"""
import logging

from google.cloud.firestore_v1 import FieldFilter
from src.db.firebase_client import get_async_firestore_client
from src.db.projects.constants import PROJECTS_COLLECTION
from src.models.project import (
    Address,
    ProjectDetails,
    ProjectDocument,
    ProjectListItem,
    ProjectStatus,
    PropertyType,
)
from src.utils.serialization import parse_enum, parse_firestore_datetime

logger = logging.getLogger(__name__)


async def get_user_projects(user_id: str, limit: int = 50) -> list[ProjectListItem]:
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
            data = doc.to_dict() or {}

            # Skip soft-deleted projects (is_deleted may be absent on legacy docs)
            if data.get("is_deleted") is True:
                continue

            # Robust Parsing via Utility
            updated_at = parse_firestore_datetime(data.get("updatedAt"))

            # Safe status conversion
            status_enum = parse_enum(ProjectStatus, data.get("status"), ProjectStatus.DRAFT)

            # Check if this project has a quote document (completed quote flow)
            has_quote = False
            try:
                quote_doc = await db.collection(PROJECTS_COLLECTION).document(doc.id).collection("private_data").document("quote").get()
                if quote_doc.exists:
                    qdata = quote_doc.to_dict() or {}
                    # A quote is considered valid if it has at least one item
                    has_quote = len(qdata.get("items", [])) > 0
            except Exception as quote_error:  # noqa: BLE001 — fail-safe per project, see below
                # A missing/unreadable quote must NOT break the whole dashboard listing, so we
                # keep has_quote=False. It must still be observable: a denied read or a missing
                # index degrades EVERY row here (this .get() runs once per project), and the
                # previous `except Exception: pass` made that outage invisible.
                logger.warning(
                    f"[Projects] Quote lookup failed for project {doc.id}: {quote_error}"
                )

            try:
                projects.append(ProjectListItem(
                    session_id=doc.id,
                    title=data.get("title", "Nuovo Progetto"),
                    status=status_enum,
                    thumbnail_url=data.get("thumbnailUrl"),
                    original_image_url=data.get("originalImageUrl"),
                    updated_at=updated_at,
                    message_count=data.get("messageCount") or 0,
                    has_quote=has_quote,
                ))
            except Exception as item_error:  # noqa: BLE001 — one malformed doc must not hide the rest
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
    # Count only ACTIVE projects — exclude soft-deleted ones.
    # is_deleted may be absent on legacy docs; the fallback handles that with Python-side filtering.
    query = (
        db.collection(PROJECTS_COLLECTION)
        .where(filter=FieldFilter("userId", "==", user_id))
        .where(filter=FieldFilter("is_deleted", "==", False))
    )

    try:
        # Use aggregation query (most efficient path)
        aggregate_query = query.count()
        results = await aggregate_query.get()
        return results[0][0].value

    except Exception as e:  # noqa: BLE001 — expected on a missing composite index, hence the fallback
        logger.warning(
            f"[Projects] Aggregation count failed for {user_id} (may lack composite index): {str(e)}. "
            "Falling back to stream-based count."
        )
        # Fallback: stream without the is_deleted filter (for legacy docs / missing index)
        # and apply Python-side filtering so we never count deleted projects.
        try:
            fallback_query = (
                db.collection(PROJECTS_COLLECTION)
                .where(filter=FieldFilter("userId", "==", user_id))
            )
            docs = fallback_query.select(['sessionId', 'is_deleted']).stream()
            count = 0
            async for doc in docs:
                doc_data = doc.to_dict() or {}
                # is_deleted absent on pre-soft-delete legacy docs → treat as active
                if doc_data.get("is_deleted") is True:
                    continue
                count += 1
            return count
        except Exception as e2:
            # FAIL CLOSED. This count feeds the 5-project quota check in
            # projects_router.create_project; returning 0 here would report "no projects
            # owned" and silently lift the limit for the whole duration of a Firestore
            # outage. Propagating turns that into a 500, which is the correct answer when
            # the quota is unknowable.
            logger.error(f"[Projects] Fallback count failed for {user_id}: {str(e2)}", exc_info=True)
            raise


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
