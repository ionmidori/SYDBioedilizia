import os
import re
import logging
from typing import Any, Dict, List, Optional
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage

from src.graph.state import AgentState
from src.prompts.system_instruction import SYSTEM_INSTRUCTION

# 🔥 CENTRALIZED TOOLS IMPORT
from src.graph.tools_registry import (
    generate_render,
    analyze_room,
    get_market_prices,
    submit_lead
)
from src.tools.lead_tools import display_lead_form

# --- 2. Tool Definition ---
tools = [
     generate_render,
     analyze_room,
     get_market_prices,
     submit_lead,
     display_lead_form
]

logger = logging.getLogger(__name__)

# LLM initialization is deferred to get_agent_graph() to prevent blocking at import time
_llm = None
_llm_with_tools = None

def _get_llm():
    """Lazy-load LLM instance."""
    global _llm
    if _llm is None:
        logger.info("⚡ Initializing Gemini LLM...")
        api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        _llm = ChatGoogleGenerativeAI(
            model="gemini-3-flash-preview",
            google_api_key=api_key,
            temperature=0.7,
        )
    return _llm

def _get_llm_with_tools():
    """Lazy-load LLM with tools bound."""
    global _llm_with_tools
    if _llm_with_tools is None:
        # Bind ALL_TOOLS from the registry
        _llm_with_tools = _get_llm().bind_tools(ALL_TOOLS)
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
                    
                    # Sub-case B: Native File Data (Video/Docs)
                    elif isinstance(part, dict) and part.get("type") == "file_data":
                         # We track file URIs if needed, but primarily we check for their presence
                         pass

                    # Sub-case C: Text Block containing markers (Legacy fallback)
                    elif isinstance(part, dict) and part.get("type") == "text":
                        text = part.get("text", "")
                        matches = re.findall(r'\[(?:Immagine|Video) allegat[oa]: (https?://[^\]]+)\]', text)
                        for url in matches:
                            found_images.append(url)
            
            if found_images:
                logger.info(f"[Context] 💉 Found {len(found_images)} images/videos in message")
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
                elif isinstance(part, dict) and part.get("type") == "file_data":
                    is_new_image_upload = True # Videos also trigger Triage
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

        # 3. Invoke LLM
        if forced_tool:
            logger.info(f"⚡ FORCE MODE: {forced_tool}")
            # Bind tools dynamically to the lazy-loaded LLM
            response = _get_llm().bind_tools(ALL_TOOLS, tool_choice=forced_tool).invoke(messages)
        else:
            # Bind only allowed tools (future: strictly filter `allowed_tools` list)
            # For now, binding all is safe as long as key triggers are handled above
            response = _get_llm_with_tools().invoke(messages)
        
        logger.info(f"🐛 RAW LLM RESPONSE: {response}")
        
        # 4. Update State (Post-Invoke)
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
    
    # 🔥 Use ALL_TOOLS for the ToolNode
    workflow.add_node("tools", ToolNode(ALL_TOOLS))
    
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
