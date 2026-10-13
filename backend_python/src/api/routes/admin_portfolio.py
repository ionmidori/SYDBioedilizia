"""
Admin portfolio API — /api/admin/portfolio (Phase 128, Fase 6.1b).

Manages the "I Nostri Capolavori" gallery of the landing page. Images are
uploaded straight from the browser to Storage (`/api/v1/admin/storage/signed-url`,
folder `portfolio`); the project only stores that image's URL, which must point
at OUR `portfolio/` folder — it is rendered on the public site.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, File, Path, Request, Response, UploadFile
from google.api_core.exceptions import GoogleAPIError
from src.api.routes.upload import _safe_read_file
from src.auth.admin import require_admin
from src.core.exceptions import ServiceError
from src.core.rate_limit import limiter
from src.db.firebase_client import get_async_firestore_client
from src.schemas.admin_content import (
    PortfolioImageUploaded,
    PortfolioList,
    PortfolioPatch,
    PortfolioProject,
    PortfolioWrite,
)
from src.schemas.internal import UserSession
from src.services import admin_content as svc
from src.services import portfolio_images
from src.services.audit import AuditAction, AuditResourceType, emit_audit_event
from src.utils.datetime_utils import utc_now
from src.utils.security import validate_image_magic_bytes

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["Admin — Portfolio"])

_ID = Path(..., min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_\-]+$")


def _audit(action: AuditAction, project_id: str, admin: UserSession, **metadata: object) -> None:
    emit_audit_event(action, AuditResourceType.CONTENT, project_id, user_id=admin.uid, metadata=metadata or None)


@router.get("/portfolio", response_model=PortfolioList)
@limiter.limit("60/minute")
async def list_portfolio(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    admin: UserSession = Depends(require_admin),  # pyright: ignore[reportUnusedParameter]
) -> PortfolioList:
    items = await svc.list_projects(get_async_firestore_client())
    return PortfolioList(items=items, visible=sum(1 for p in items if p.active))


@router.post("/portfolio/image", response_model=PortfolioImageUploaded, status_code=201)
@limiter.limit("60/hour")
async def upload_portfolio_image(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    file: UploadFile = File(...),
    admin: UserSession = Depends(require_admin),
) -> PortfolioImageUploaded:
    """Check, clean and store a gallery photo; the response carries the URL to save on the project.

    The picture is re-encoded (WebP, max 1920 px) and stripped of all metadata,
    GPS position included. A photo that is uploaded but never attached to a
    project stays in `portfolio/` unreferenced (harmless, public gallery assets only).
    """
    await validate_image_magic_bytes(file)
    raw = await _safe_read_file(file, portfolio_images.MAX_UPLOAD_BYTES)
    data, width, height = await asyncio.to_thread(portfolio_images.process_image, raw)
    blob_path = portfolio_images.new_blob_path()
    try:
        await asyncio.to_thread(portfolio_images.upload_sync, blob_path, data)
    except (GoogleAPIError, OSError, RuntimeError) as exc:
        logger.warning("[Portfolio] Storage upload failed [%s].", type(exc).__name__)
        raise ServiceError(
            message="The image could not be stored. Try again in a moment.",
            error_code="PORTFOLIO_UPLOAD_FAILED",
        ) from exc
    _audit(AuditAction.PORTFOLIO_UPLOAD, blob_path, admin, size_bytes=len(data))
    return PortfolioImageUploaded(
        image_url=portfolio_images.public_url(svc.bucket_name(), blob_path),
        width=width,
        height=height,
        size_bytes=len(data),
    )


@router.post("/portfolio", response_model=PortfolioProject, status_code=201)
@limiter.limit("30/hour")
async def create_portfolio_project(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: PortfolioWrite,
    admin: UserSession = Depends(require_admin),
) -> PortfolioProject:
    data = body.model_dump()
    data["image_url"] = svc.checked_image_url(body.image_url)
    project = await svc.create_project(get_async_firestore_client(), data, utc_now())
    _audit(AuditAction.PORTFOLIO_CREATE, project.id, admin, active=project.active)
    return project


@router.patch("/portfolio/{project_id}", response_model=PortfolioProject)
@limiter.limit("60/hour")
async def update_portfolio_project(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    body: PortfolioPatch,
    project_id: str = _ID,
    admin: UserSession = Depends(require_admin),
) -> PortfolioProject:
    changes = body.model_dump(exclude_unset=True)
    if "image_url" in changes:
        changes["image_url"] = svc.checked_image_url(changes["image_url"])
    project, replaced_image = await svc.update_project(get_async_firestore_client(), project_id, changes, utc_now())
    _audit(AuditAction.PORTFOLIO_UPDATE, project_id, admin, fields=sorted(changes))
    if replaced_image:
        await svc.delete_image_quietly(replaced_image)
    return project


@router.delete("/portfolio/{project_id}", status_code=204)
@limiter.limit("30/hour")
async def delete_portfolio_project(
    request: Request,  # pyright: ignore[reportUnusedParameter]  # required by slowapi
    project_id: str = _ID,
    admin: UserSession = Depends(require_admin),
) -> Response:
    image_url = await svc.delete_project(get_async_firestore_client(), project_id)
    _audit(AuditAction.PORTFOLIO_DELETE, project_id, admin)
    await svc.delete_image_quietly(image_url)
    return Response(status_code=204)
