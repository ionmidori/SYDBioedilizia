from typing import TypedDict, Sequence, Annotated
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

def add_windowed(current: list, new: list) -> list:
    """Append new items and keep only the last 5."""
    updated = current + new
    return updated[-5:]

class AgentState(TypedDict):
    """State for the conversational AI agent."""
    messages: Annotated[Sequence[BaseMessage], add_messages]
    session_id: str
    user_id: str
    project_id: str | None # 🌍 Context Awareness
    
    # 🧠 Deterministic State Tracking
    phase: str          # "TRIAGE", "DESIGN", "QUOTE",    # Context Tracking
    active_image_url: str
    has_uploaded_image: bool
    has_analyzed_room: bool
    is_authenticated: bool # 🔥 NEW: Auth Gatingdified
    generated_render_url: str # Last render URL (to prevent duplicates)
    quote_data: dict    # Partial quote data collected
    
    # 🧠 CoT & Reasoning (Tier 1 Integration)
    # Windowed memory (max 5 steps) to prevent context bloat
    internal_plan: Annotated[list[dict], add_windowed] 
    thought_log: Annotated[list[str], add_windowed]    # Private chain of thought history

    # 🚀 User Journey & Cross-Selling Flags (2026-02-10)
    is_quote_completed: bool      # Default: False
    is_render_completed: bool     # Default: False
    
    # Data Cache (Avoids re-asking for Name/Email)
    user_contact_cache: dict | None  # {name, email, phone}
