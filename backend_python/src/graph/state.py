from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """State for the conversational AI agent."""
    messages: Annotated[Sequence[BaseMessage], add_messages]
    session_id: str
    user_id: str
    
    # 🧠 Deterministic State Tracking
    phase: str          # "TRIAGE", "DESIGN", "QUOTE",    # Context Tracking
    active_image_url: str
    has_uploaded_image: bool
    has_analyzed_room: bool
    is_authenticated: bool # 🔥 NEW: Auth Gatingdified
    generated_render_url: str # Last render URL (to prevent duplicates)
    quote_data: dict    # Partial quote data collected
    
    # 🧠 CoT & Reasoning (Tier 1 Integration)
    internal_plan: list[dict] # Stores serialized ReasoningStep objects
    thought_log: list[str]    # Private chain of thought history
