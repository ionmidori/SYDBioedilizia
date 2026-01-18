import os
import logging
from typing import Any, Dict, List, Optional
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain_core.tools import tool

from src.graph.state import AgentState
from src.tools.sync_wrappers import submit_lead_sync, get_market_prices_sync, generate_render_sync
from src.prompts.system_instruction import SYSTEM_INSTRUCTION

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Define LangChain tools using decorators
@tool
def submit_lead(name: str, email: str, phone: str, project_details: str, session_id: str = "default") -> str:
    """Save lead contact info and project details to database."""
    return submit_lead_sync(name, email, phone, project_details, session_id)

@tool
def get_market_prices(query: str) -> str:
    """Get current market prices for renovation materials or services."""
    return get_market_prices_sync(query)

@tool
def generate_render(
    prompt: str, 
    room_type: str, 
    style: str,
    session_id: str = "default",
    mode: str = "creation",
    source_image_url: Optional[str] = None,
    keep_elements: Optional[List[str]] = None
) -> str:
    """Generate photorealistic interior design rendering (T2I or I2I mode)."""
    return generate_render_sync(
        prompt, room_type, style, session_id, mode, source_image_url, keep_elements
    )

# Tool list
tools = [submit_lead, get_market_prices, generate_render]

# Initialize Gemini LLM with tools
llm = ChatGoogleGenerativeAI(
    model="gemini-2.0-flash-exp",
    google_api_key=GEMINI_API_KEY,
    temperature=0.7,
)

llm_with_tools = llm.bind_tools(tools)

def should_continue(state: AgentState) -> str:
    """Routing function: determine if we should call tools or end."""
    messages = state["messages"]
    last_message = messages[-1]
    
    # If LLM made tool calls, go to tools node
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "tools"
    
    # Otherwise end
    return END

def create_agent_graph():
    """Create LangGraph StateGraph with Gemini LLM and tools."""
    
    # Define the agent node
    def agent_node(state: AgentState) -> Dict[str, Any]:
        """Run the agent with current state."""
        messages = state["messages"]
        
        # Add system instruction to first message if not present
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            messages = [SystemMessage(content=SYSTEM_INSTRUCTION)] + list(messages)
        
        # Invoke LLM with tools
        response = llm_with_tools.invoke(messages)
        
        return {"messages": [response]}
    
    # Build graph
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("agent", agent_node)
    workflow.add_node("tools", ToolNode(tools))
    
    # Set entry point
    workflow.set_entry_point("agent")
    
    # Add conditional edges
    workflow.add_conditional_edges(
        "agent",
        should_continue,
        {
            "tools": "tools",
            END: END
        }
    )
    
    # After tools, always go back to agent
    workflow.add_edge("tools", "agent")
    
    # Compile graph
    return workflow.compile()

# Export compiled graph
agent_graph = create_agent_graph()
