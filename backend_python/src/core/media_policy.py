"""What media the app accepts — one definition shared by the upload endpoints
(what may be stored) and the chat orchestrator (what may be sent to the model)."""

MAX_IMAGE_SIZE = 10 * 1024 * 1024   # 10MB
MAX_VIDEO_SIZE = 100 * 1024 * 1024  # 100MB

# Video MIME type (as detected from magic bytes and stored on the object) -> file extension
VIDEO_MIME_EXTENSIONS = {"video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}
VIDEO_EXTENSION_MIMES = {ext: mime for mime, ext in VIDEO_MIME_EXTENSIONS.items()}
