"""Shared constants for the projects package."""

# Collection name (we extend "sessions" to serve as "projects")
PROJECTS_COLLECTION = "sessions"

# Project files live in `projects/{id}/files` — the public projection, not the
# `sessions` document: chat uploads, renders, gallery, rooms, Firestore rules.
FILES_PARENT_COLLECTION = "projects"
# Field of a `files` document naming its room (Phase 138; queried with
# `uploadedAt`, see firestore.indexes.json). Absent = not filed yet.
FILE_ROOM_FIELD = "roomId"

# Chat merge (Phase 139): a chat copied into the user's chat keeps its data and
# points at the chat that now holds the copy; it is archived (hidden from the
# client, kept for the quote history, the admin and the GDPR).
MERGED_INTO = "merged_into"
ARCHIVED_AT = "archived_at"
# Bumped on `sessions/{id}` when the stored history changes other than by a new
# turn (a merge): an ADK session held in memory is rebuilt from Firestore.
HISTORY_REVISION = "historyRevision"
