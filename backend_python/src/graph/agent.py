import os
import re
import logging
from typing import Any, Dict, List, Optional
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from langchain_core.tools import tool

from src.graph.state import AgentState
from src.tools.sync_wrappers import (
    submit_lead_sync, 
    get_market_prices_sync, 
    generate_render_sync,
    save_quote_sync,      # 🆕
    analyze_room_sync,    # 🆕
    plan_renovation_sync  # 🆕
)
from src.prompts.system_instruction import SYSTEM_INSTRUCTION

logger = logging.getLogger(__name__)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Define LangChain tools using decorators
@tool
def submit_lead(name: str, email: str, phone: str, project_details: str, session_id: str = "default") -> str:
    """Save lead contact info and project details to database."""
    return submit_lead_sync(name, email, phone, project_details, session_id)

@tool
def get_market_prices(query: str, user_id: str = "default") -> str:
    """Get current market prices for renovation materials or services."""
    return get_market_prices_sync(query, user_id)

@tool
def generate_render(
    prompt: str, 
    room_type: str, 
    style: str,
    session_id: str = "default",
    mode: str = "creation",
    source_image_url: Optional[str] = None,
    keep_elements: Optional[List[str]] = None,
    user_id: str = "default"
) -> str:
    """Generate photorealistic interior design rendering (T2I or I2I mode)."""
    logger.info(f"[Tool] 🎨 generate_render called:")
    logger.info(f"  - prompt: {prompt[:50]}...")
    logger.info(f"  - room_type: {room_type}")
    logger.info(f"  - style: {style}")
    logger.info(f"  - mode: {mode}")
    logger.info(f"  - source_image_url: {source_image_url}")
    logger.info(f"  - keep_elements: {keep_elements}")
    
    return generate_render_sync(
        prompt, room_type, style, session_id, mode, source_image_url, keep_elements, user_id
    )

@tool
def save_quote(
    user_id: str,
    ai_data: Dict[str, Any],
    image_url: Optional[str] = None
) -> str:
    """
    Save a structured quote draft to the database.
    Use this when the user completes the 'Technical Surveyor' interview.
    """
    return save_quote_sync(user_id, image_url, ai_data)

@tool
def analyze_room(image_url: str) -> str:
    """
    CRITICAL: You MUST call this tool IMMEDIATELY when the user uploads an image, even if they say nothing.
    Analyze room structure, dimensions, and features from an image.
    """
    return analyze_room_sync(image_url)

@tool
def plan_renovation(image_url: str, style: str, keep_elements: Optional[List[str]] = None) -> str:
    """
    Generate a text-only architectural plan using the 'Skeleton & Skin' methodology.
    Use this to PROPOSE a design before generating the render, or if the user asks for design advice without an image.
    """
    return plan_renovation_sync(image_url, style, keep_elements)

# Tool list (lightweight - just function references)
tools = [submit_lead, get_market_prices, generate_render, save_quote, analyze_room, plan_renovation]

# LLM initialization is deferred to get_agent_graph() to prevent blocking at import time
_llm = None
_llm_with_tools = None

def _get_llm():
    """Lazy-load LLM instance."""
    global _llm
    if _llm is None:
        logger.info("⚡ Initializing Gemini LLM...")
        _llm = ChatGoogleGenerativeAI(
            model="gemini-2.5-flash",
            google_api_key=GEMINI_API_KEY,
            temperature=0.7,
        )
    return _llm

def _get_llm_with_tools():
    """Lazy-load LLM with tools bound."""
    global _llm_with_tools
    if _llm_with_tools is None:
        _llm_with_tools = _get_llm().bind_tools(tools)
    return _llm_with_tools

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
        """
        Run the agent with current state.
        
        Implements intelligent context injection by:
        1. Scanning conversation history for image upload markers
        2. Dynamically enriching system instruction with image URLs
        3. Ensuring AI awareness of visual context across conversation turns
        """
        messages = state["messages"]
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 🧠 CONTEXT INJECTION: Scan for last uploaded image URL
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 🧠 CONTEXT INJECTION: Scan for last uploaded images
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        found_images = []
        
        # Traverse messages backwards to find most recent image(s)
        for msg in reversed(messages):
            # Case 1: Text Content (String)
            if hasattr(msg, 'content') and isinstance(msg.content, str):
                # Regex for both Image and Video markers
                # Matches: [Immagine allegata: URL] or [Video allegato: URL]
                matches = re.findall(r'\[(?:Immagine|Video) allegat[oa]: (https?://[^\]]+)\]', msg.content)
                for url in matches:
                    found_images.append(url)
            
            # Case 2: Multimodal Content (List)
            elif hasattr(msg, 'content') and isinstance(msg.content, list):
                for part in msg.content:
                    # Sub-case A: Native Image Block
                    if isinstance(part, dict) and part.get("type") == "image_url":
                        img_field = part.get("image_url")
                        url = img_field.get("url") if isinstance(img_field, dict) else img_field
                        if url:
                            found_images.append(url)
                    
                    # Sub-case B: Text Block containing markers (common for Videos)
                    elif isinstance(part, dict) and part.get("type") == "text":
                        text = part.get("text", "")
                        matches = re.findall(r'\[(?:Immagine|Video) allegat[oa]: (https?://[^\]]+)\]', text)
                        for url in matches:
                            found_images.append(url)
            
            if found_images:
                logger.info(f"[Context] 💉 Found {len(found_images)} images in message")
                break
        
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 📝 DYNAMIC SYSTEM INSTRUCTION: Inject active context
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        active_system_instruction = SYSTEM_INSTRUCTION
        
        if found_images:
            # Inject ALL images found
            import json
            images_json = json.dumps(found_images)
            last_image_url = found_images[-1] # Default to the last one
            
            # Best Practice: Append context without mutating the original constant
            active_system_instruction += f"""

[[ACTIVE CONTEXT]]
AVAILABLE_IMAGES={images_json}
LAST_UPLOADED_IMAGE_URL="{last_image_url}"
When calling generate_render, you MUST set sourceImageUrl="{last_image_url}" if the user wants to modify this image.
If the user specifically asks for another image from the list, use that URL instead.
"""
            logger.info(f"[Context] 💉 Injected {len(found_images)} image URLs into system instruction")
        
        # Add system instruction to first message if not present
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            messages = [SystemMessage(content=active_system_instruction)] + list(messages)
        else:
            # Replace existing SystemMessage with enriched version
            # This ensures the latest context is always present
            messages = [
                SystemMessage(content=active_system_instruction) if isinstance(msg, SystemMessage) else msg
                for msg in messages
            ]
        
        # 🐛 DEBUG PROMPT SCRIPT
        with open("debug_prompt.txt", "w", encoding="utf-8") as f:
            f.write(active_system_instruction)
        
        # Invoke LLM with tools
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 🛡️ DETERMINISTIC CONTROL LOGIC (The "Python Brain")
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        # 1. Determine Current Phase & Allowable Tools
        current_phase = state.get("phase", "TRIAGE") # Default
        allowed_tools = tools[:] # Default: all tools
        
        # Check for image upload in THIS turn
        latest_msg = messages[-1]
        is_new_image_upload = False
        if isinstance(latest_msg.content, str):
            if "[Immagine allegata:" in latest_msg.content:
                is_new_image_upload = True
        elif isinstance(latest_msg.content, list):
             for part in latest_msg.content:
                if isinstance(part, dict) and part.get("type") == "image_url":
                    is_new_image_upload = True
                    break
                elif isinstance(part, dict) and part.get("type") == "text" and "[Immagine allegata:" in part.get("text", ""):
                    is_new_image_upload = True
                    break

        # 2. Apply Strict Rules based on events
        forced_tool = None
        
        if is_new_image_upload:
            logger.info("⚡ RULE: New image -> Phase TRIAGE -> Force analyze_room")
            current_phase = "TRIAGE"
            forced_tool = "analyze_room"
            
        elif state.get("has_analyzed_room"):
             # If analyzed, move to design/survey
             if current_phase == "TRIAGE":
                 current_phase = "DESIGN"

        # ⚡ RULE: Explicit render request -> Force generate_render
        # This fixes the issue where the model acknowledges but fails to call the tool
        user_text = ""
        if isinstance(latest_msg.content, str):
            user_text = latest_msg.content.lower()
        elif isinstance(latest_msg.content, list):
            # Multimodal content - extract text parts
            for part in latest_msg.content:
                if isinstance(part, dict) and part.get("type") == "text":
                    user_text += part.get("text", "").lower() + " "
                elif isinstance(part, str):
                    user_text += part.lower() + " "
        
        # Keywords that trigger render generation
        render_keywords = [
            "procedi", "vai", "fallo", "genera", "crea", "renderizza",
            "fai il rendering", "crea il rendering", "genera il rendering",
            "rendering", "render", "mostrami", "fammi vedere"
        ]
        
        if any(kw in user_text for kw in render_keywords):
            # Only force if we have an image context
            if found_images or state.get("active_image_url"):
                logger.info(f"⚡ RULE: Explicit render request detected in: '{user_text[:50]}...'")
                logger.info(f"⚡ RULE: Found images: {found_images}, active_url: {state.get('active_image_url')}")
                forced_tool = "generate_render"
        
        # 3. Filter Tools to Prevent Loops/Hallucinations
        if current_phase == "TRIAGE" and not forced_tool:
             # If in triage but no forced tool (e.g. follow up chat), restrict to basic tools
             # logic could be expanded here
             pass

        # 4. Invoke LLM
        if forced_tool:
            logger.info(f"⚡ FORCE MODE: {forced_tool}")
            # Bind tools dynamically to the lazy-loaded LLM
            response = _get_llm().bind_tools(tools, tool_choice=forced_tool).invoke(messages)
        else:
            # Bind only allowed tools (future: strictly filter `allowed_tools` list)
            # For now, binding all is safe as long as key triggers are handled above
            response = _get_llm_with_tools().invoke(messages)
        
        logger.info(f"🐛 RAW LLM RESPONSE: {response}")
        
        # 5. Update State (Post-Invoke)
        # Check if analyze_room was just called
        did_analyze = False
        if hasattr(response, 'tool_calls') and response.tool_calls:
            for tc in response.tool_calls:
                if tc.get('name') == 'analyze_room':
                    did_analyze = True
                    break
        
        # Inherit previous state or set true if just did it
        is_analyzed = state.get("has_analyzed_room", False) or did_analyze

        return {
            "messages": [response],
            "phase": current_phase,
            "active_image_url": last_image_url if found_images else state.get("active_image_url"),
            "has_uploaded_image": bool(found_images),
            "has_analyzed_room": is_analyzed
        }
    
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

# Lazy initialization singleton
_agent_graph = None

def get_agent_graph():
    """Lazy loade the agent graph to prevent startup blockers."""
    global _agent_graph
    if _agent_graph is None:
        logger.info("⚡ Initializing Agent Graph...")
        _agent_graph = create_agent_graph()
        logger.info("✅ Agent Graph Initialized")
    return _agent_graph
