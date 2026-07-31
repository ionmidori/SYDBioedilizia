"""
Firestore operations for Projects (Dashboard).

This package provides async functions to manage projects in Firestore.
Projects are stored in the `sessions` collection with extended schema.

This __init__ is a facade preserving the historical flat-module API
(`src.db.projects.X`) after the split into queries/mutations/deletion/media.
NOTE: monkeypatching must target the concrete submodules
(e.g. `src.db.projects.deletion.get_storage_client`), not this facade.
"""
from src.db.projects.constants import PROJECTS_COLLECTION
from src.db.projects.deletion import (
    _delete_collection_batch,
    _delete_storage_blobs,
    delete_project,
    soft_delete_project,
)
from src.db.projects.media import sync_project_cover
from src.db.projects.mutations import (
    claim_project,
    create_project,
    save_project_file_metadata,
    update_project,
    update_project_details,
)
from src.db.projects.queries import count_user_projects, get_project, get_user_projects

__all__ = [
    "PROJECTS_COLLECTION",
    # private helpers re-exported for scripts/cleanup_zombie_projects.py and legacy callers
    "_delete_collection_batch",
    "_delete_storage_blobs",
    "claim_project",
    "count_user_projects",
    "create_project",
    "delete_project",
    "get_project",
    "get_user_projects",
    "save_project_file_metadata",
    "soft_delete_project",
    "sync_project_cover",
    "update_project",
    "update_project_details",
]
