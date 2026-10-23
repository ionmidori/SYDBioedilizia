"""Shared constants for the projects package."""

# Collection name (we extend "sessions" to serve as "projects")
PROJECTS_COLLECTION = "sessions"

# Project files live in `projects/{id}/files` — the public projection, not the
# `sessions` document: chat uploads, renders, gallery, rooms, Firestore rules.
FILES_PARENT_COLLECTION = "projects"
# Field of a `files` document naming its room (Phase 138; queried with
# `uploadedAt`, see firestore.indexes.json). Absent = not filed yet.
FILE_ROOM_FIELD = "roomId"
