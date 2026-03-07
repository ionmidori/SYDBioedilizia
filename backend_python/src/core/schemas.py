from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from .context import get_request_id

class APIErrorResponse(BaseModel):
    """
    Standardized Error Response Structure.
    Ensures the Frontend always receives a consistent error format.
    """
    model_config = {"extra": "ignore"}
    error_code: str = Field(..., description="Machine-readable error code (e.g., AUTH_001)")
    message: str = Field(..., description="Human-readable error message")
    detail: Optional[Dict[str, Any]] = Field(None, description="Debug details (optional)")
    request_id: str = Field(default_factory=get_request_id, description="Tracing ID")
