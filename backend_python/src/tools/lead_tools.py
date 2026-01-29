from langchain.tools import tool
from typing import Optional

@tool
def display_lead_form(quote_summary: str, quote_id: Optional[str] = "temp") -> str:
    """
    Triggers the display of a secure UI Lead Capture Form on the user's screen.
    Use this tool IMMEDIATELY when the user indicates interest in a quote.
    Do NOT ask for name/email in text. Call this tool instead.

    Args:
        quote_summary: A brief 1-sentence summary of what is being quoted (e.g., "Ristrutturazione bagno moderno").
        quote_id: Optional internal ID (default "temp").
    
    Returns:
        JSON string instructing the frontend to render the widget.
    """
    # The return value here is mostly for the LLM's internal history.
    # The Frontend intercepts the TOOL CALL itself to render the UI.
    return f"DISPLAY_WIDGET:LEAD_FORM:{quote_id}:{quote_summary}"
