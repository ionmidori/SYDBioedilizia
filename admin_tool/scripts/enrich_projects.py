"""
enrich_projects.py — Production-grade UAT data enrichment utility.

Patches existing Firestore project documents with required metadata fields
(client_name, client_email, address) whenever they are missing, ensuring
stable UAT runs without data-shape failures.

Usage (from admin_tool/ directory):
    python scripts/enrich_projects.py              # live run
    python scripts/enrich_projects.py --dry-run    # preview only
    python scripts/enrich_projects.py --project-id <id>  # single target

Skill: building-admin-dashboards — §Firebase Firestore Integration
Skill: error-handling-patterns  — §Robust Utility Scripts
"""
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

# ── Path bootstrap ────────────────────────────────────────────────────────────
# Ensures imports resolve correctly whether the script is run from:
#   - admin_tool/ (normal case)
#   - admin_tool/scripts/ (direct invocation)
_ADMIN_ROOT = Path(__file__).resolve().parents[1]
if str(_ADMIN_ROOT) not in sys.path:
    sys.path.insert(0, str(_ADMIN_ROOT))

from src.db.firebase_init import get_db  # noqa: E402 (after sys.path bootstrap)
from src.db.quote_repo import QuoteRepository  # noqa: E402

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger("enrich_projects")

# ── Defaults (UAT sample data) ────────────────────────────────────────────────
_DEFAULT_CLIENT_NAME = "Mario Rossi (UAT)"
_DEFAULT_EMAIL = "test-uat@sydbioedilizia.it"
_DEFAULT_ADDRESS = "Via Roma 1, 00100 Roma (RM)"


def _compute_patches(project_id: str, data: dict[str, Any]) -> dict[str, Any]:
    """
    Return only the fields that are missing from *data*.

    Args:
        project_id: Firestore document ID (used to derive a unique project name).
        data: Existing document data dict.

    Returns:
        Dict of field → value for fields that need to be added.
        Empty dict if no patch is required.
    """
    patches: dict[str, Any] = {}

    if not data.get("client_name") and not data.get("name"):
        patches["client_name"] = _DEFAULT_CLIENT_NAME
        patches["name"] = f"Progetto UAT - {project_id[:6]}"

    if not data.get("client_email") and not data.get("email"):
        patches["client_email"] = _DEFAULT_EMAIL

    if not data.get("address"):
        patches["address"] = _DEFAULT_ADDRESS

    return patches


def enrich_projects(
    *,
    dry_run: bool = False,
    project_id: str | None = None,
) -> None:
    """
    Iterate projects and patch any missing UAT metadata fields.

    Args:
        dry_run:    If True, compute and log patches without writing to Firestore.
        project_id: If provided, only process this single project document.
    """
    mode_label = "[DRY-RUN]" if dry_run else "[LIVE]"
    logger.info("%s Starting project enrichment process.", mode_label)

    db = get_db()
    repo = QuoteRepository()

    try:
        if project_id:
            doc = db.collection("projects").document(project_id).get()
            if not doc.exists:
                logger.error("Project '%s' not found in Firestore. Aborting.", project_id)
                sys.exit(1)
            project_docs = [doc]
        else:
            project_docs = list(db.collection("projects").stream())

        enriched = 0
        skipped = 0

        for doc in project_docs:
            data: dict[str, Any] = doc.to_dict() or {}
            patches = _compute_patches(doc.id, data)

            if not patches:
                logger.debug("Project %s — already complete, skipping.", doc.id)
                skipped += 1
                continue

            logger.info(
                "%s Enriching project %s → fields: %s",
                mode_label,
                doc.id,
                list(patches.keys()),
            )

            if not dry_run:
                repo.update_project(doc.id, patches)

            enriched += 1

        logger.info(
            "%s Done. Enriched=%d  Skipped=%d  Total=%d",
            mode_label,
            enriched,
            skipped,
            enriched + skipped,
        )

    except Exception:
        logger.exception("Enrichment process encountered a fatal error.")
        sys.exit(1)


# ── CLI entrypoint ─────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Enrich Firestore project documents with UAT sample metadata.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        default=False,
        help="Preview patches without writing to Firestore.",
    )
    parser.add_argument(
        "--project-id",
        metavar="ID",
        default=None,
        help="Target a single project document by its Firestore ID.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    args = _parse_args()
    enrich_projects(dry_run=args.dry_run, project_id=args.project_id)
