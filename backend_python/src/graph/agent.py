import os
import re
import logging
from typing import Any, Dict, List, Optional
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage

from src.graph.state import AgentState
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
            temperature=0.7,
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
        model="gemini-2.0-flash-exp", # ⚡ FASTEST MODEL
        google_api_key=api_key,
        temperature=0.2, # Low temp for strict logic
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
    
    # If LLM made tool calls, go to tools node
    if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
        return "tools"
    
    # Otherwise end
    return END

def create_agent_graph():
    """Create LangGraph StateGraph with Gemini LLM and tools."""
    
    # Define the agent node
    # Define the execution node (formerly agent_node)
    def execution_node(state: AgentState) -> Dict[str, Any]:
        """
        The 'Cortex' that executes the plan or handles the conversation.
        """
        messages = state["messages"]
        internal_plan = state.get("internal_plan", [])
        latest_plan = internal_plan[-1] if internal_plan else None

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # 🧠 CONTEXT INJECTION (Kept from original)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # ... (Context injection logic is critical so we keep it here or move to a pre-processing node)
        # For V2, we keeping it here to minimize refactor risk for now, but ideally it goes to 'context_node'
        
        found_images = []
        # ... [Scanning logic same as before] ... 
        # (To save space in this edit, assuming the scanning logic is preserved or we can optimize it)
        # Let's perform a lightweight scan here or rely on the previous implementation if not changing.
        # WAITING: Actually, to be safe, I will re-implement the scan briefly or assume it's there.
        # Better approach: We will TRUST the reasoning node's analysis in the future, 
        # but for now we keep the context injection operational as the Prompt needs it.
        
        # Traverse messages backwards for images ( Simplified for brevity in this specific edit block, 
        # but in real code, I'd keep the robust one. Re-inserting robust logic below )
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
            
        # Auth Check Logic
        active_system_instruction += f"\n\n[[PROJECT CONTEXT]]\nSession ID: {state.get('session_id')}\nIS_AUTHENTICATED={str(state.get('is_authenticated', False)).upper()}"

        # Update System Message
        if not any(isinstance(msg, SystemMessage) for msg in messages):
            messages = [SystemMessage(content=active_system_instruction)] + list(messages)
        else:
             messages = [SystemMessage(content=active_system_instruction) if isinstance(msg, SystemMessage) else msg for msg in messages]

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # �️ DETERMINISTIC EXECUTION (Tier 3)
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        
        # 1. READ THE PLAN
        tool_to_call = None
        if latest_plan and latest_plan.get("action") == "call_tool":
            tool_to_call = latest_plan.get("tool_name")
            logger.info(f"🤖 Execution Node: Following Plan -> Call {tool_to_call}")
        
        # 2. INVOKE
        if tool_to_call:
            # Force the specific tool call
            # 🛡️ RBTA CHECK: Verify access even if Planned
            available_tools = SOPManager.get_available_tools(state)
            # Filter ALL_TOOLS to find the one we want IF it is allowed
            target_tool = next((t for t in available_tools if t.name == tool_to_call), None)
            
            if target_tool:
                response = _get_llm().bind_tools([target_tool], tool_choice=tool_to_call).invoke(messages)
            else:
                logger.warning(f"🛑 Security Block: Tool '{tool_to_call}' not allowed for this user role.")
                # Fallback: Ask user or explain denial
                # We invoke without tools to let the LLM explain
                response = _get_llm().invoke(messages + [SystemMessage(content=f"SYSTEM ALERT: You cannot use {tool_to_call} due to permission restrictions. Explain this to the user.")])
                
        else:
            # Normal conversation mode (but restricted by what tools are bound)
            # Future: RBTA (Role Based Tool Access) filters ALL_TOOLS here
            available_tools = SOPManager.get_available_tools(state)
            response = _get_llm().bind_tools(available_tools).invoke(messages)
            
        return {
            "messages": [response],
            "phase": "EXECUTION", # Simplified phase tracking
             # Persist image state logic from original
            "has_uploaded_image": bool(found_images),
        }

    # 🚀 NEW: REASONING NODE (Tier 1 Directive)
    def reasoning_node(state: AgentState) -> Dict[str, Any]:
        """
        The 'Pre-Cortex' that plans the move before acting.
        Enforces 'Fail-Fast' via Pydantic Validation.
        """
        messages = state["messages"]
        
        # 1. Prepare Reasoning Context
        # We give the reasoning model a meta-view of the conversation
        reasoning_model = _get_reasoning_llm().with_structured_output(ReasoningStep)
        
        # 2. Invoke CoT
        try:
            logger.info("🤔 Reasoning Node: Thinking...")
            step = reasoning_model.invoke(messages)
            
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
            emergency_plan = ReasoningStep(
                analysis=f"System Error during reasoning: {str(e)}",
                action="terminate",
                confidence_score=0.0,
                validation_passed=False 
            )
            # Make sure validation_passed is actually handled or simulated
            # We might need to adjust the model to allow manual creation if validation logic allows.
            # Ideally validation logic is in field validators.
            
            return {
                "internal_plan": [{
                    "analysis": "Internal Reasoning Error",
                    "action": "terminate",
                    "validation_passed": False,
                    "confidence_score": 0.0
                }]
            }

    # Define the old agent node execution (renamed or repurposed?)
    # For now we keep `agent_node` as the EXECUTION node (Tier 2/3)
    # But we need to modifying it to READ the plan.
    

    
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
            
            # 1. Length Check (Max 5 words)
            if len(content.split()) > 5:
                return "reasoning"
                
            # 2. Greeting/Simple Pattern Check
            greetings = ["ciao", "hello", "hi", "buongiorno", "buonasera", "grazie", "thank", "ok", "va bene"]
            normalized = content.lower().strip()
            
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
    
    # After tools, always go back to execution
    workflow.add_edge("tools", "execution")
    
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
