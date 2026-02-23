import re
import json
import logging
from typing import List, Any, Optional
from langchain_core.messages import ToolMessage
from src.graph.state import AgentState
from src.prompts.system_prompts import SystemPrompts
from src.db.firebase_client import get_async_firestore_client

logger = logging.getLogger(__name__)

class ContextBuilder:
    """
    Responsible for constructing the final System Prompt by combining:
    1. Static Base Instruction (Persona, Tools, Rules)
    2. Dynamic Context (Auth, Project, Media)
    3. System Status (Loop Guard, Last Tool Execution)
    4. Active Playbook (Vertex AI Strategy)
    """

    @staticmethod
    async def build_system_prompt(state: AgentState) -> str:
        """
        Dynamically assembles the authoritative system prompt.
        Now async to support Firestore lookups for project context.
        """
        base_instruction = SystemPrompts.get_instruction("default")
        
        # 1. Media Context
        media_context = ContextBuilder._build_media_context(state)
        
        # 2. Project/Auth Context (A3 FIX: now includes construction details)
        project_context = await ContextBuilder._build_project_context(state)
        
        # 3. System Status (Loop Guard)
        system_status = ContextBuilder._build_system_status(state)
        
        # 4. Reasoning Context (Tier 1 -> Tier 3 Handoff)
        reasoning_context = ContextBuilder._build_reasoning_context(state)

        # Assemble
        final_prompt = f"{base_instruction}\n\n{media_context}\n\n{project_context}\n\n{reasoning_context}\n\n{system_status}"
        return final_prompt.strip()

    @staticmethod
    def _build_reasoning_context(state: AgentState) -> str:
        internal_plan = state.get("internal_plan", [])
        if not internal_plan:
            return ""
            
        # 🧠 AMNESIA FIX: Summarize ALL recent reasoning steps, not just the last one.
        # This ensures the AI remembers "Japandi" even after "Light Strip" is added.
        
        history_log = []
        for i, step in enumerate(internal_plan):
            analysis = step.get("analysis", "")
            action = step.get("action", "")
            # Only include relevant details to save tokens
            history_log.append(f"Step {i+1}: {analysis} -> {action}")
            
        latest = internal_plan[-1]
        intent = latest.get("intent_category", "general")
        
        history_str = "\n".join(history_log)
        
        return (
            f"[[REASONING HISTORY (Last 5 Steps)]]\n"
            f"{history_str}\n\n"
            f"[[CURRENT STATE]]\n"
            f"CURRENT INTENT: {intent}\n"
            f"INSTRUCTION: Synthesize the above history. If previous steps established a style/constraint (e.g., Japandi), PRESERVE IT unless explicitly changed."
        )

    @staticmethod
    def _build_media_context(state: AgentState) -> str:
        messages = state["messages"]
        found_images = []
        
        # Robust image scanning (Reverse order to find latest)
        # Robust image scanning (Reverse order to find latest)
        # 🛡️ LIMIT: Only scan the "Current Turn" (consecutive human messages from the end)
        # Stop scanning as soon as we hit a non-human message (AI or System) to prevent stale context re-injection.
        
        for msg in reversed(messages):
            if isinstance(msg, (ToolMessage)) or msg.type == "ai": 
                # Stop if we hit an AI response or Tool result essentially marking the end of the previous turn
                break
            if hasattr(msg, 'content') and isinstance(msg.content, str):
                matches = re.findall(r'\[(?:Immagine|Video) allegat[oa]: (https?://[^\]]+)\]', msg.content)
                found_images.extend(matches)
            elif hasattr(msg, 'content') and isinstance(msg.content, list):
                for part in msg.content:
                   if isinstance(part, dict):
                       if part.get("type") == "image_url":
                           url_data = part.get("image_url")
                           if isinstance(url_data, dict): found_images.append(url_data.get("url"))
                           else: found_images.append(url_data)
                       elif part.get("type") == "file_data": 
                           # Handle native file URIs if needed in context
                           pass
            if found_images: break
            
        if found_images:
            return f"[[ACTIVE CONTEXT]]\nLAST_UPLOADED_IMAGE_URL=\"{found_images[-1]}\"\nAVAILABLE_IMAGES={json.dumps(found_images)}"
        return ""

    @staticmethod
    async def _build_project_context(state: AgentState) -> str:
        """
        A3 FIX: Now queries Firestore for construction details and injects
        them into the AI context (budget, area, property type, constraints).
        """
        session_id = state.get('session_id', 'unknown')
        is_authenticated = str(state.get('is_authenticated', False)).upper()
        project_id = state.get('project_id')
        
        base = f"[[PROJECT CONTEXT]]\nSession ID: {session_id}\nIS_AUTHENTICATED={is_authenticated}"
        
        # A3 FIX: Load construction details from Firestore
        if project_id:
            try:
                db = get_async_firestore_client()
                doc = await db.collection('sessions').document(project_id).get()
                if doc.exists:
                    data = doc.to_dict()
                    details = data.get('constructionDetails')
                    if details:
                        base += f"\nProject ID: {project_id}"
                        base += f"\nFOOTAGE_SQM={details.get('footage_sqm', 'N/A')}"
                        base += f"\nPROPERTY_TYPE={details.get('property_type', 'N/A')}"
                        base += f"\nBUDGET_CAP_EUR={details.get('budget_cap', 'N/A')}"
                        
                        address = details.get('address', {})
                        if address:
                            base += f"\nLOCATION={address.get('city', '')}, {address.get('zip', '')}"
                        
                        constraints = details.get('renovation_constraints', [])
                        if constraints:
                            base += f"\nCONSTRAINTS={', '.join(constraints)}"
                        
                        notes = details.get('technical_notes')
                        if notes:
                            base += f"\nTECHNICAL_NOTES={notes}"
                    else:
                        base += f"\nProject ID: {project_id}\nCONSTRUCTION_DETAILS=NOT_SET"
            except Exception as e:
                logger.warning(f"[ContextBuilder] Failed to load project details: {e}")
        
        return base

    @staticmethod
    def _build_system_status(state: AgentState) -> str:
        messages = state["messages"]
        last_message = messages[-1] if messages else None
        
        if isinstance(last_message, ToolMessage):
            return (
                f"[[SYSTEM STATUS]]\n"
                f"LAST_TOOL_EXECUTED: {last_message.name}\n"
                f"STATUS: SUCCESS\n"
                f"CRITICAL INSTRUCTION: You have just completed {last_message.name}. "
                f"Do NOT call it again with the same parameters. Move immediately to examining the output or answering the user."
            )
        return ""
