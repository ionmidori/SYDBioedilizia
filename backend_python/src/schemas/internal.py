from pydantic import BaseModel, Field
from typing import Dict, Any

class UserSession(BaseModel):
    """
    Strict typing for authenticated user sessions.
    Replaces loose dicts from jwt_handler.
    """
    uid: str
    email: str | None = None
    is_authenticated: bool = False
    is_anonymous: bool = False # 🔥 Added for Guest Mode
    is_debug_user: bool = False
    claims: Dict[str, Any] = Field(default_factory=dict)
