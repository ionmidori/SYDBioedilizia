import os
import re
import logging
from typing import Any, Dict, List, Optional
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage

from src.graph.state import AgentState
from src.models.reasoning import ReasoningStep # 🔥 Tier 1 Guardrail
from src.graph.edges import route_step # 🔥 Tier 2 Router
from src.prompts.system_instruction import SYSTEM_INSTRUCTION

# 🔥 CENTRALIZED TOOLS IMPORT
from src.graph.tools_registry import (
    generate_render,
    analyze_room,
    get_market_prices,
    submit_lead,
    list_project_files
)
from src.tools.lead_tools import display_lead_form
from src.tools.auth_tools import request_login # 🔥 NEW
from src.agents.sop_manager import SOPManager # 🔥 Tier 3 Gatekeeper

# --- 2. Tool Definition ---
tools = [
     generate_render,
     analyze_room,
     get_market_prices,
     submit_lead,
     display_lead_form,
     list_project_files,
     request_login # 🔥 NEW
]

# 🔥 Fix: Define ALL_TOOLS alias for consistency with lazy loading
ALL_TOOLS = tools

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
            temperature=0.1, # 🗣️ LIGHTLY HUMAN (Balanced for chat)
        )

    return _llm

def _get_reasoning_llm():
    """
    Lazy-load the 'System 2' Logic Brain.
    Uses Gemini 2.0 Flash for maximum speed and deterministic output.
    """
    global _llm
    # Note: We reuse the client but could instantiate a separate model version here
    # For V2 architecture, we specifically want Flash.
    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    return ChatGoogleGenerativeAI(
        model="gemini-2.5-flash", # ⚡ STABLE FLASH MODEL
        google_api_key=api_key,
        temperature=0.0, # 🔥 STRICT LOGIC
    )

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
    
    # 🛡️ LOOP GUARD: Check for excessive tool usage in recent history
    # We look at the last 10 messages. If we see > 5 ToolMessages, we abort.
    # This prevents the agent from getting stuck in a generate -> refine -> generate loop.
    recent_history = messages[-10:] if len(messages) > 10 else messages
    tool_message_count = sum(1 for m in recent_history if isinstance(m, ToolMessage))
    
    if tool_message_count >= 5:
        logger.warning(f"🛑 LOOP DETECTED: Aborting after {tool_message_count} tool calls in recent history.")
        return END

    # If LLM made tool calls, go to tools node
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "tools"
    
    # Otherwise end
    return END

def create_agent_graph():
    """Create LangGraph StateGraph with Gemini LLM and tools."""
    
    # Define the agent node
    def _inject_context(state: AgentState) -> str:
        """Centralized context injection for all nodes."""
        messages = state["messages"]
        found_images = []
        
        # Robust image scanning
        for msg in reversed(messages):
            if hasattr(msg, 'content') and isinstance(msg.content, str):
                matches = re.findall(r'\[(?:Immagine|Video) allegat[oa]: (https?://[^\]]+)\]', msg.content)
                found_images.extend(matches)
            elif hasattr(msg, 'content') and isinstance(msg.content, list):
                for part in msg.content:
                   if isinstance(part, dict) and part.get("type") == "image_url":
                       url_data = part.get("image_url")
                       if isinstance(url_data, dict): found_images.append(url_data.get("url"))
                       else: found_images.append(url_data)
            if found_images: break

        # Inject Context logic
        active_system_instruction = SYSTEM_INSTRUCTION
        if found_images:
            import json
            active_system_instruction += f"\n\n[[ACTIVE CONTEXT]]\nLAST_UPLOADED_IMAGE_URL=\"{found_images[-1]}\"\nAVAILABLE_IMAGES={json.dumps(found_images)}"
            
        # Auth & Project Context
        active_system_instruction += f"\n\n[[PROJECT CONTEXT]]\nSession ID: {state.get('session_id')}\nIS_AUTHENTICATED={str(state.get('is_authenticated', False)).upper()}"

        # 🛑 SYSTEM STATUS (Loop Guard Context) - Tier 1 Awareness
        # If the last message was a Tool Execution, explicitly tell the Brain what happened.
        last_message = messages[-1] if messages else None
        if isinstance(last_message, ToolMessage):
            active_system_instruction += f"\n\n[[SYSTEM STATUS]]\n"
            active_system_instruction += f"LAST_TOOL_EXECUTED: {last_message.name}\n"
            active_system_instruction += f"STATUS: SUCCESS\n"
            active_system_instruction += f"CRITICAL INSTRUCTION: You have just completed {last_message.name}. "
            active_system_instruction += f"Do NOT call it again with the same parameters. Move immediately to examining the output or answering the user."

        return active_system_instruction

    def execution_node(state: AgentState) -> Dict[str, Any]:
        """
        The 'Cortex' that executes the plan or handles the conversation.
        """
        messages = state["messages"]
        internal_plan = state.get("internal_plan", [])
        latest_plan = internal_plan[-1] if internal_plan else None

        # Inject Context
        active_system_instruction = _inject_context(state)

        # Scan for images for state persistence
        found_images = []
        for msg in reversed(messages):
            if hasattr(msg, 'content') and isinstance(msg.content, str):
                matches = re.findall(r'\[(?:Immagine|Video) allegat[oa]: (https?://[^\]]+)\]', msg.content)
                found_images.extend(matches)
            elif hasattr(msg, 'content') and isinstance(msg.content, list):
                for part in msg.content:
                   if isinstance(part, dict) and part.get("type") == "image_url":
                       url_data = part.get("image_url")
                       if isinstance(url_data, dict): found_images.append(url_data.get("url"))
                       else: found_images.append(url_data)
            if found_images: break

        # Update System Message - FORCE FIRST POSITION (Native System Instruction)
        # 1. Strip existing system messages to prevent confusion
        messages = [msg for msg in messages if not isinstance(msg, SystemMessage)]
        # 2. Prepend the authoritative system instruction
        messages = [SystemMessage(content=active_system_instruction)] + messages

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # ️ DETERMINISTIC EXECUTION (Tier 3)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        # 1. READ THE PLAN
        tool_to_call = None
        if latest_plan and latest_plan.get("action") == "call_tool":
            tool_to_call = latest_plan.get("tool_name")
            logger.info(f"🤖 Execution Node: Following Plan -> Call {tool_to_call}")
        
        # 2. INVOKE
        if tool_to_call:
            # 🛡️ LOOP GUARD (Tier 3 Defense)
            # Check if this tool was JUST executed with the exact same parameters.
            last_message = messages[-1]
            is_redundant_call = False
            
            if isinstance(last_message, ToolMessage) and last_message.name == tool_to_call:
                # Simplified check: If we just got a ToolMessage for this tool, and we are planning to call it again immediately,
                # we need to be very careful.
                # Let's compare "latest_plan.tool_args" vs "previous_plan_step.tool_args" if available.
                
                prev_step = internal_plan[-2] if len(internal_plan) >= 2 else None
                current_step_args = latest_plan.get("tool_args", {})
                
                # If we have a previous step and it was a tool call for the same tool
                if prev_step and prev_step.get("tool_name") == tool_to_call:
                     prev_args = prev_step.get("tool_args", {})
                     
                     # DEEP EQUALITY CHECK
                     if current_step_args == prev_args:
                         is_redundant_call = True
                         logger.warning(f"🛑 Loop Guard: Skipping redundant call to {tool_to_call} with identical args.")

                if is_redundant_call:
                    # ⚡ FAST PATH: Synthetic Success Message
                    # We fool the LLM into thinking it worked, but with a warning to stop.
                    import uuid
                    synthetic_id = str(uuid.uuid4())
                    synthetic_msg = ToolMessage(
                        tool_call_id=synthetic_id,
                        content=f"SYSTEM ALERT: Tool '{tool_to_call}' was already executed with these EXACT parameters. Do not repeat. Verify the output above and proceed to synthesis.",
                        name=tool_to_call
                    )
                    return {
                        "messages": [synthetic_msg],
                        "phase": "EXECUTION",
                        "has_uploaded_image": bool(found_images),
                    }

                # Normal Execution Flow
                # 🛡️ RBTA CHECK: Verify access even if Planned
                available_tools = SOPManager.get_available_tools(state)
                # Filter ALL_TOOLS to find the one we want IF it is allowed
                target_tool = next((t for t in available_tools if t.name == tool_to_call), None)
                
                if target_tool:
                    response = _get_llm().bind_tools([target_tool], tool_choice=tool_to_call).invoke(messages)
                else:
                    logger.warning(f"🛑 Security Block: Tool '{tool_to_call}' not allowed for this user role.")
                    # Fallback
                    response = _get_llm().invoke(messages + [SystemMessage(content=f"SYSTEM ALERT: You cannot use {tool_to_call} due to permission restrictions. Explain this to the user.")])
                    
            else:
                # Normal conversation mode (but restricted by what tools are bound)
                available_tools = SOPManager.get_available_tools(state)
                response = _get_llm().bind_tools(available_tools).invoke(messages)
                
            return {
                "messages": [response],
                "phase": "EXECUTION", 
                "has_uploaded_image": bool(found_images),
            }
        
        # Fallback to pure conversation if no tool planned
        else:
             available_tools = SOPManager.get_available_tools(state)
             response = _get_llm().bind_tools(available_tools).invoke(messages)
             return {
                 "messages": [response],
                 "phase": "EXECUTION",
                 "has_uploaded_image": bool(found_images),
             }

    # 🚀 NEW: REASONING NODE (Tier 1 Directive)
    def reasoning_node(state: AgentState) -> Dict[str, Any]:
        """
        The 'Pre-Cortex' that plans the move before acting.
        Enforces 'Fail-Fast' via Pydantic Validation.
        """
        messages = state["messages"]
        
        # 1. Inject Context to ALL messages for Reasoning
        active_system_instruction = _inject_context(state)
        
        # 2. Update System Message - FORCE FIRST POSITION
        # 1. Strip existing system messages
        cleaned_messages = [msg for msg in messages if not isinstance(msg, SystemMessage)]
        # 2. Prepend authoritative instruction
        reasoning_messages = [SystemMessage(content=active_system_instruction)] + cleaned_messages

        # 2. Prepare Reasoning Model
        reasoning_model = _get_reasoning_llm().with_structured_output(ReasoningStep)
        
        # 3. Invoke CoT
        try:
            logger.info("🤔 Reasoning Node: Thinking...")
            step = reasoning_model.invoke(reasoning_messages)
            
            # If we get here, Pydantic validation PASSED (Fail-Fast check 1)
            logger.info(f"💡 Thought: {step.analysis}")
            logger.info(f"👉 Action: {step.action} (Tool: {step.tool_name})")
            
            # 3. Return Update
            # We append the serialized plan to the state
            return {
                "internal_plan": [step.model_dump()],
                "thought_log": [step.analysis] 
            }
            
        except Exception as e:
            logger.error(f"❌ Reasoning Failed (Fail-Fast Triggered): {e}")
            # Fallback to a safe error state -> terminate
            
            # TRUNCATE ERROR MESSAGE TO FIT PYDANTIC LIMIT (200 chars)
            error_msg = str(e)[:150] + "..."
            
            return {
                "internal_plan": [{
                    "analysis": "Internal Reasoning Error",
                    "action": "terminate",
                    "validation_passed": False,
                    "confidence_score": 0.0
                }]
            }

    # Build graph
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("reasoning", reasoning_node)
    workflow.add_node("execution", execution_node) # Formerly agent_node
    
    # 🔥 Use ALL_TOOLS for the ToolNode
    workflow.add_node("tools", ToolNode(ALL_TOOLS))
    
    # Set entry point -> Reasoning First (Tier 1)
    workflow.set_entry_point("reasoning")
    
    # ---------------------------------------------------------
    # ⚡ GATEKEEPER (Optimization)
    # ---------------------------------------------------------
    def entry_gatekeeper(state: AgentState) -> str:
        """
        Bypass Reasoning Node for simple interactions (Hello, Thank you).
        Reduces latency and cost.
        """
        messages = state["messages"]
        if not messages: return "reasoning"
        
        last_msg = messages[-1]
        
        # Only check text messages
        if isinstance(last_msg, HumanMessage) or (isinstance(last_msg, dict) and last_msg.get("type") == "human"):
            content = last_msg.content if hasattr(last_msg, "content") else last_msg.get("content", "")
            
            # 1. Normalize Content (Handle Multimodal List)
            text_content = ""
            if isinstance(content, str):
                text_content = content
            elif isinstance(content, list):
                # Extract text parts
                text_parts = []
                for part in content:
                    if isinstance(part, str):
                         text_parts.append(part)
                    elif isinstance(part, dict) and part.get("type") == "text":
                         text_parts.append(part.get("text", ""))
                text_content = " ".join(text_parts)
            
            # 1. Length Check (Max 5 words)
            if len(text_content.split()) > 5:
                # If multimodal (list), also default to reasoning as it implies complexity
                if isinstance(content, list):
                    return "reasoning"
                return "reasoning"
                
            # 2. Greeting/Simple Pattern Check
            greetings = ["ciao", "hello", "hi", "buongiorno", "buonasera", "grazie", "thank", "ok", "va bene"]
            normalized = text_content.lower().strip() # 🔥 FIX: Use text_content instead of raw content
            
            # Exact match or starts with greeting
            if any(normalized.startswith(g) for g in greetings):
                logger.info("🚀 Gatekeeper: Fast-tracking greeting -> Execution Node")
                return "execution"
                
        return "reasoning"

    # Set Conditional Entry Point
    workflow.set_conditional_entry_point(
        entry_gatekeeper,
        {
            "reasoning": "reasoning",
            "execution": "execution"
        }
    )
    
    # 🔥 Tier 2: Deterministic Routing
    # Replaces: workflow.add_edge("reasoning", "execution")
    workflow.add_conditional_edges(
        "reasoning",
        route_step,
        {
            "execution": "execution",
            "tools": "tools",
            END: END
        }
    )
    
    # Execution -> Tools OR End
    workflow.add_conditional_edges(
        "execution",
        should_continue,
        {
            "tools": "tools",
            END: END
        }
    )
    
    # After tools, always go back to reasoning to decide next step
    workflow.add_edge("tools", "reasoning")
    
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
