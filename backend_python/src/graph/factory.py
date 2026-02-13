import logging
from typing import List
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_core.messages import SystemMessage, ToolMessage
from langchain_core.language_models import BaseChatModel
from langchain_core.tools import BaseTool

from src.graph.state import AgentState
from src.graph.context_builder import ContextBuilder
from src.services.intent_classifier import IntentClassifier
from src.graph.edges import route_step
from src.agents.sop_manager import SOPManager
from src.models.reasoning import ReasoningStep

logger = logging.getLogger(__name__)

class AgentGraphFactory:
    """
    Factory for creating the LangGraph Agent.
    Decouples graph definition from global state and specific LLM instances.
    """

    def __init__(self, llm: BaseChatModel, reasoning_llm: BaseChatModel, tools: List[BaseTool]):
        self.llm = llm
        self.reasoning_llm = reasoning_llm
        self.tools = tools
        # Bind tools once for the execution model
        self.llm_with_tools = self.llm.bind_tools(tools)

    def create_graph(self):
        """Builds and compiles the StateGraph."""
        
        # 1. Define Nodes
        
        async def reasoning_node(state: AgentState):
            """Tier 1: High-level planning."""
            messages = state["messages"]
            
            # Context Injection (A3: now async)
            active_prompt = await ContextBuilder.build_system_prompt(state)
            
            # Filter system messages & Prepend new one
            cleaned_messages = [msg for msg in messages if not isinstance(msg, SystemMessage)]
            reasoning_messages = [SystemMessage(content=active_prompt)] + cleaned_messages
            
            # Logic Model
            reasoning_model = self.reasoning_llm.with_structured_output(ReasoningStep)
            
            try:
                logger.info("🤔 Reasoning Node: Thinking...")
                step = reasoning_model.invoke(reasoning_messages, config={"tags": ["reasoning_tier"]})
                
                logger.info(f"💡 Thought: {step.analysis}")
                logger.info(f"👉 Action: {step.action} (Tool: {step.tool_name})")
                
                return {
                    "internal_plan": [step.model_dump()],
                    "thought_log": [step.analysis]
                }
            except Exception as e:
                logger.error(f"❌ Reasoning Failed: {e}")
                return {
                    "internal_plan": [{
                        "analysis": "Internal Reasoning Error",
                        "action": "terminate",
                        "validation_passed": False
                    }]
                }

        async def execution_node(state: AgentState):
            """Tier 3: Execution and Tool Calling."""
            messages = state["messages"]
            internal_plan = state.get("internal_plan", [])
            latest_plan = internal_plan[-1] if internal_plan else None
            
            # Context Injection (A3: now async)
            active_prompt = await ContextBuilder.build_system_prompt(state)
            
            # Filter & Prepend
            cleaned_messages = [msg for msg in messages if not isinstance(msg, SystemMessage)]
            exec_messages = [SystemMessage(content=active_prompt)] + cleaned_messages
            
            # Deterministic routing based on plan
            tool_to_call = None
            if latest_plan and latest_plan.get("action") == "call_tool":
                tool_to_call = latest_plan.get("tool_name")
                
                # 🛡️ SAFETY & CONFIDENCE CHECK (CoT 2.0)
                # Read new fields with defaults for safety
                confidence = latest_plan.get("confidence_score", 1.0)
                risk = getattr(latest_plan, "risk_score", 0.0) # usage of getattr for safety
                
                # THRESHOLDS
                # 1. Low Confidence -> Ask User
                if confidence < 0.5:
                    logger.warning(f"⚠️ Low Confidence ({confidence}). Overriding '{tool_to_call}' to ASK_USER.")
                    tool_to_call = None
                    exec_messages.append(SystemMessage(content=f"SYSTEM ALERT: Your reasoning confidence ({confidence}) is too low to execute '{tool_to_call}'. Instead, ask the user for clarification."))

                # 2. High Risk / Action Mismatch -> Block
                # (Example: Risk 0.9 but Confidence only 0.8 -> Block? For now, stick to confidence)
            
            if tool_to_call:
                # 🛡️ Loop Guard Check (Simplified for Factory)
                last_msg = messages[-1] if messages else None
                if isinstance(last_msg, ToolMessage) and last_msg.name == tool_to_call:
                     # Check redundancy logic (omitted for brevity, can re-import if complex)
                     pass

                # RBTA Check
                available_tools = SOPManager.get_available_tools(state)
                target_tool = next((t for t in available_tools if t.name == tool_to_call), None)
                
                if target_tool:
                     response = self.llm.bind_tools([target_tool], tool_choice=tool_to_call).invoke(exec_messages)
                else:
                     logger.warning(f"🛑 Security Block: Tool '{tool_to_call}' not allowed.")
                     response = self.llm.invoke(exec_messages + [SystemMessage(content=f"SYSTEM ALERT: Tool {tool_to_call} disallowed.")])
            else:
                # Pure conversation
                available_tools = SOPManager.get_available_tools(state)
                response = self.llm.bind_tools(available_tools).invoke(exec_messages)
                
            return {"messages": [response], "phase": "EXECUTION"}

        async def gatekeeper(state: AgentState) -> str:
            """Optimized Entry Point."""
            return await IntentClassifier.classify_intent(state["messages"])

        def should_continue(state: AgentState) -> str:
            """Check if we should go to tools."""
            last_message = state["messages"][-1]
            if hasattr(last_message, 'tool_calls') and last_message.tool_calls:
                return "tools"
            return END

        def custom_tools_node(state: AgentState):
            """
            Executes tools and updates state flags for User Journey tracking.
            Wraps the standard ToolNode logic but adds state reduction.
            """
            # 1. Execute Tools
            tool_node = ToolNode(self.tools)
            result = tool_node.invoke(state) # Returns {'messages': [ToolMessage, ...]}
            
            # 2. State Reduction (Flags)
            new_messages = result.get("messages", [])
            updates = {"messages": new_messages}
            
            for msg in new_messages:
                if isinstance(msg, ToolMessage):
                    # Flag: Quote Completed
                    if msg.name == "submit_lead" and "Leadsavedsuccessfully" in msg.content.replace(" ", ""):
                        updates["is_quote_completed"] = True
                        # Cache Contact Info (Optimization)
                        # We extract it from the tool call arguments in the LAST AI Message
                        # But simpler: just set flag for now. Data cache can be added if needed.
                        logger.info("✅ JOURNEY: Quote Completed. Flag set.")

                    # Flag: Render Completed
                    if msg.name == "generate_render" and "http" in msg.content:
                        updates["is_render_completed"] = True
                        logger.info("✅ JOURNEY: Render Completed. Flag set.")
            
            return updates

        # 2. Build Graph
        workflow = StateGraph(AgentState)
        
        workflow.add_node("reasoning", reasoning_node)
        workflow.add_node("execution", execution_node)
        workflow.add_node("tools", custom_tools_node) # Replaced standard ToolNode
        
        # Edges
        # Note: set_conditional_entry_point supports async functions
        workflow.set_conditional_entry_point(
            gatekeeper,
            {"reasoning": "reasoning", "execution": "execution"}
        )
        
        workflow.add_conditional_edges(
            "reasoning",
            route_step,
            {"execution": "execution", "tools": "tools", END: END}
        )
        
        workflow.add_conditional_edges(
            "execution",
            should_continue,
            {"tools": "tools", END: END}
        )
        
        workflow.add_edge("tools", "reasoning")
        
        return workflow.compile()
