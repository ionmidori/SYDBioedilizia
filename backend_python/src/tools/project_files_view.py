"""What the gallery and project-files tools know about a project's `files`
documents and rooms (Phase 138). Kept out of `project_storage`: that module is
imported by `services.quote_dossier`, and `src.db.projects` imports it back.
"""
from dataclasses import dataclass, field
from typing import Any

from src.db.projects.constants import FILE_ROOM_FIELD


@dataclass(frozen=True)
class ProjectFilesView:
    """The project's `files` documents (with `id`) and room labels, read by the
    caller (async) before listing: they give each file its id and room.
    `room_only`: `files` are one room's files and replace the Storage listing."""

    room_labels: dict[str, str] = field(default_factory=dict)
    files: list[dict[str, Any]] = field(default_factory=list)
    room_only: bool = False

    def by_storage_path(self) -> dict[str, dict[str, Any]]:
        return {
            path: doc for doc in self.files
            if (path := (doc.get("metadata") or {}).get("storage_path"))
        }

    def room_label(self, doc: dict[str, Any] | None) -> str | None:
        room_id = (doc or {}).get(FILE_ROOM_FIELD)
        return self.room_labels.get(room_id, room_id) if room_id else None

