import logging
from typing import Optional

from pydantic import BaseModel, Field
from src.core.exceptions import ServiceError
from src.db.leads import save_lead
from src.models.lead import LeadData

logger = logging.getLogger(__name__)


class SubmitLeadInput(BaseModel):
    """Input schema for submit_lead tool."""
    model_config = {"extra": "forbid"}
    name: str = Field(..., description="Customer name from the chat context")
    email: str = Field(..., description="Customer email address")
    phone: Optional[str] = Field(None, description="Customer phone number (optional)")
    project_details: str = Field(..., description="Detailed project description provided by the user")
    room_type: Optional[str] = Field(None, description="Type of room being renovated (e.g. kitchen, bathroom)")
    style: Optional[str] = Field(None, description="Preferred design style (e.g. modern, rustic)")

async def submit_lead_wrapper(
    name: str,
    email: str,
    project_details: str,
    uid: str,
    session_id: str,
    phone: Optional[str] = None,
    room_type: Optional[str] = None,
    style: Optional[str] = None,
) -> str:
    """
    Saves a new customer lead to the database.
    Call this when the user explicitly agrees to be contacted or provides their details for a quote.
    """
    try:
        lead_data = LeadData(
            name=name,
            email=email,
            phone=phone,
            project_details=project_details,
            room_type=room_type,
            style=style
        )

        result = await save_lead(lead_data, uid, session_id)
        return f"Lead saved successfully! ID: {result['lead_id']}"
    except Exception as e:
        # Log the full internal detail server-side, but surface a generic,
        # non-leaking error to the caller. Raising (instead of returning an
        # error string) also stops the /api/submit-lead endpoint from reporting
        # a failure as {"status": "success", ...}.
        logger.error(f"[submit_lead] Failed to save lead: {e}", exc_info=True)
        raise ServiceError(
            message="Unable to save your request right now. Please try again later.",
            error_code="LEAD_SAVE_FAILED",
        ) from e

# Define the tool but note: 'uid' and 'session_id' need to be injected at runtime
# We will partial this function in the graph construction when we have the request context
SUBMIT_LEAD_TOOL_DEF = {
    "name": "submit_lead",
    "description": "Save customer contact info and project details for a quote/lead.",
    "args_schema": SubmitLeadInput
}
