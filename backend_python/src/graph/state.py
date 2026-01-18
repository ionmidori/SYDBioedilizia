from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages

class AgentState(TypedDict):
    """State for the conversational AI agent."""
    messages: Annotated[Sequence[BaseMessage], add_messages]
    session_id: str
    user_id: str  # ✅ Added for quota tracking
