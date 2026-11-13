import hashlib
from contextvars import ContextVar

# Global Context Variables
_request_id_ctx_var: ContextVar[str] = ContextVar("request_id", default="system")
_session_id_ctx_var: ContextVar[str | None] = ContextVar("session_id", default=None)
_user_id_ctx_var: ContextVar[str | None] = ContextVar("user_id", default=None)
# Short hash of the session id: what the logs carry to follow one conversation (never the id).
_session_ref_ctx_var: ContextVar[str | None] = ContextVar("session_ref", default=None)

# 8 hex characters = 32 bits: enough to tell conversations apart, useless to find a session id.
SESSION_REF_LENGTH = 8

def get_request_id() -> str:
    """Get the current request ID."""
    return _request_id_ctx_var.get()

def set_request_id(request_id: str):
    """Set the current request ID."""
    _request_id_ctx_var.set(request_id)

def get_session_id() -> str | None:
    """Get the current session ID."""
    return _session_id_ctx_var.get()

def set_session_id(session_id: str):
    """Set the current session ID."""
    _session_id_ctx_var.set(session_id)

def session_ref(session_id: str) -> str:
    """Short, non-reversible reference of a session (a project id is a token for a guest)."""
    return hashlib.sha256(session_id.encode("utf-8")).hexdigest()[:SESSION_REF_LENGTH]

def bind_session(session_id: str) -> None:
    """Tag the log lines of the current request with the session reference."""
    _session_ref_ctx_var.set(session_ref(session_id))

def get_session_ref() -> str | None:
    """The session reference of the current request, if a session was bound."""
    return _session_ref_ctx_var.get()

def get_user_id() -> str | None:
    """Get the current user ID."""
    return _user_id_ctx_var.get()

def set_user_id(user_id: str):
    """Set the current user ID."""
    _user_id_ctx_var.set(user_id)
