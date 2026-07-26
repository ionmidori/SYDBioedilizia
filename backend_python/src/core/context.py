from contextvars import ContextVar

# Global Context Variables
_request_id_ctx_var: ContextVar[str] = ContextVar("request_id", default="system")
_session_id_ctx_var: ContextVar[str | None] = ContextVar("session_id", default=None)
_user_id_ctx_var: ContextVar[str | None] = ContextVar("user_id", default=None)

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

def get_user_id() -> str | None:
    """Get the current user ID."""
    return _user_id_ctx_var.get()

def set_user_id(user_id: str):
    """Set the current user ID."""
    _user_id_ctx_var.set(user_id)
