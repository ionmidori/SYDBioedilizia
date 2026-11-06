"""
Add a project to the public portfolio from a photo and a JSON manifest.

The same pipeline as the Console admin (/admin/portfolio), for when the photo is
on this machine: the picture is checked and cleaned by
`src/services/portfolio_images.py` (WebP, max 1920 px, EXIF orientation applied,
ALL metadata dropped — GPS included), stored under `portfolio/`, and the project
is created in `portfolio_projects` with the admin service, so it appears at the
end of the gallery. Firestore stays the only source of truth: later edits go
through the Console.

Manifest (JSON, the fields of the Console form; `image_url` is set by the script):
    {
      "title": "Bagno in terracotta e legno",
      "category": "Bagno",
      "location": "Roma",
      "description": "...",
      "stats": {"area": "", "duration": "", "budget": ""},
      "active": true
    }

Usage (from backend_python/, credentials from .env — this WRITES live data):
    uv run python scripts/add_portfolio_project.py --manifest p.json --image photo.jpg --dry-run
    uv run python scripts/add_portfolio_project.py --manifest p.json --image photo.jpg

--dry-run validates the manifest, processes the photo and writes the result to
--preview (default: next to the photo, `<name>.preview.webp`); nothing is uploaded.
A project with the same title and location is refused unless --allow-duplicate.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path
from typing import Any

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

from pydantic import ValidationError  # noqa: E402
from src.db.firebase_client import get_async_firestore_client, init_firebase  # noqa: E402
from src.schemas.admin_content import PortfolioProject, PortfolioWrite  # noqa: E402
from src.services import admin_content as svc  # noqa: E402
from src.services import portfolio_images  # noqa: E402
from src.utils.datetime_utils import utc_now  # noqa: E402

# Shape-valid stand-in used to validate the manifest before anything is uploaded.
_PENDING_IMAGE = "pending-upload"


class ManifestError(ValueError):
    """The manifest cannot become a portfolio project."""


def parse_manifest(data: Any) -> PortfolioWrite:
    """Validate the manifest with the same model as the admin API, before any I/O."""
    if not isinstance(data, dict):
        raise ManifestError("The manifest must be a JSON object.")
    if "image_url" in data:
        raise ManifestError("Do not set image_url: the script uploads the photo and sets it.")
    try:
        return PortfolioWrite.model_validate({**data, "image_url": _PENDING_IMAGE})
    except ValidationError as exc:
        raise ManifestError(str(exc)) from exc


def with_image(project: PortfolioWrite, image_url: str) -> dict[str, Any]:
    """The Firestore payload: the validated fields plus the checked image URL."""
    return {**project.model_dump(), "image_url": svc.checked_image_url(image_url)}


def find_duplicate(existing: list[PortfolioProject], title: str, location: str) -> PortfolioProject | None:
    """A project already showing the same title in the same place (case and spaces ignored)."""

    def key(value: str) -> str:
        return " ".join(value.split()).casefold()

    wanted = (key(title), key(location))
    return next((p for p in existing if (key(p.title), key(p.location)) == wanted), None)


async def _audit(action: str, resource_id: str, operator: str) -> None:
    # Written directly (not via emit_audit_event): that one is fire-and-forget and
    # the script would exit before the background write ran.
    await get_async_firestore_client().collection("audit_logs").add(
        {
            "action": action,
            "resource_type": "content",
            "resource_id": resource_id,
            "status": "success",
            "user_id": operator,
            "metadata": {"via": "scripts/add_portfolio_project.py"},
            "timestamp": utc_now(),
        }
    )


async def _publish(project: PortfolioWrite, webp: bytes, operator: str) -> PortfolioProject:
    blob_path = portfolio_images.new_blob_path()
    await asyncio.to_thread(portfolio_images.upload_sync, blob_path, webp)
    image_url = portfolio_images.public_url(svc.bucket_name(), blob_path)
    await _audit("portfolio.upload", blob_path, operator)
    try:
        created = await svc.create_project(get_async_firestore_client(), with_image(project, image_url), utc_now())
    except Exception:
        # No project points at the photo: do not leave it in the public folder.
        await svc.delete_image_quietly(image_url)
        raise
    await _audit("portfolio.create", created.id, operator)
    return created


async def _run(args: argparse.Namespace) -> None:
    try:
        project = parse_manifest(json.loads(Path(args.manifest).read_text(encoding="utf-8")))
    except (OSError, json.JSONDecodeError, ManifestError) as exc:
        sys.exit(f"Invalid manifest: {exc}")

    image = Path(args.image)
    raw = image.read_bytes()
    if len(raw) > portfolio_images.MAX_UPLOAD_BYTES:
        sys.exit(f"The photo is larger than {portfolio_images.MAX_UPLOAD_BYTES // (1024 * 1024)} MB.")
    webp, width, height = await asyncio.to_thread(portfolio_images.process_image, raw)
    print(f"photo:   {width}x{height} WebP, {len(webp) // 1024} KB (metadata removed)")
    print(f"project: {project.title} · {project.category} · {project.location} · active={project.active}")

    if args.dry_run:
        preview = Path(args.preview) if args.preview else image.with_suffix(".preview.webp")
        preview.write_bytes(webp)
        print(f"DRY RUN (nothing uploaded). Preview: {preview}")
        return

    init_firebase()
    existing = await svc.list_projects(get_async_firestore_client())
    duplicate = find_duplicate(existing, project.title, project.location)
    if duplicate and not args.allow_duplicate:
        sys.exit(f"A project with this title and location already exists ({duplicate.id}). Use --allow-duplicate.")

    created = await _publish(project, webp, args.operator)
    print(f"Done: project {created.id}, position {created.order} in the gallery.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", required=True, help="JSON file with the project fields")
    parser.add_argument("--image", required=True, help="the photo (JPEG, PNG or WebP)")
    parser.add_argument("--dry-run", action="store_true", help="validate and process the photo, upload nothing")
    parser.add_argument("--preview", help="where --dry-run writes the processed photo")
    parser.add_argument("--allow-duplicate", action="store_true", help="add it even if title+location exist")
    parser.add_argument("--operator", default="cli", help="who runs the change (stored in the audit log)")
    asyncio.run(_run(parser.parse_args()))


if __name__ == "__main__":
    main()
