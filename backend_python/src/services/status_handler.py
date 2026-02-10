
import logging
from typing import AsyncGenerator, Dict, Any, Optional

from src.utils.stream_protocol import stream_status, stream_reasoning

logger = logging.getLogger(__name__)

class GraphStatusHandler:
    """
    Parses low-level LangGraph events and keeps the user informed
    with high-level narrative status updates AND structured reasoning.
    """

    def __init__(self):
        self._last_status = None

    async def process_event(self, event: Dict[str, Any]) -> AsyncGenerator[str, None]:
        """
        Process a single graph event and yield status/data chunks if applicable.
        """
        event_type = event.get("event")
        name = event.get("name")
        data = event.get("data", {})
        
        # 1. Tool Execution Start (Contextual)
        if event_type == "on_tool_start":
            tool_name = name
            tool_input = data.get("input", {})
            
            message = self._get_tool_start_message(tool_name, tool_input)
            if message:
                async for chunk in self._emit_status(message):
                    yield chunk
                
        # 2. Node Transitions (Narrative)
        elif event_type == "on_chain_start":
            # Filter out the main wrapper chain, focus on specific nodes
            if name in ["reasoning_node", "intent_classifier", "router", "generate_render", "analyze_room"]:
                message = self._get_node_message(name)
                if message:
                    async for chunk in self._emit_status(message):
                        yield chunk
                        
        # 3. Reasoning Node Completion (CoT Data Stream)
        # We capture the output of the reasoning node to stream the "Thought process"
        elif event_type == "on_chain_end" and name == "reasoning_node":
            output = data.get("output", {})
            # The reasoning node returns {"internal_plan": [...], "thought_log": [...]}
            internal_plan = output.get("internal_plan", [])
            if internal_plan:
                latest_step = internal_plan[-1]
                # Stream the specific ReasoningStep
                async for chunk in stream_reasoning(latest_step):
                    yield chunk

    def _emit_status(self, message: str) -> AsyncGenerator[str, None]:
        self._last_status = message
        # We invoke the async generator from protocol
        return stream_status(message)

    def _get_tool_start_message(self, tool_name: str, args: Dict[str, Any]) -> Optional[str]:
        """Generates dynamic context-aware messages."""
        try:
            # Perplexity / Search
            if tool_name == "perplexity" or tool_name == "tavily_search_results_json":
                query = args.get("query", "")
                if query:
                    # Truncate if too long
                    display_query = (query[:30] + '...') if len(query) > 30 else query
                    return f"Ricerco '{display_query}' sul web..."
                return "Effettuo una ricerca sul web..."

            # Submit Lead
            if tool_name == "submit_lead_data":
                return "Salvo i dati del contatto..."

            # Generate Render (Imagen)
            if tool_name == "generate_image" or tool_name == "generate_render":
                prompt = args.get("prompt", "")
                return "Configuro il motore di rendering..."

            # Retrieve Projects
            if tool_name == "retrieve_projects":
                return "Consulto il database progetti..."

            # Check User Profile
            if tool_name == "check_user_profile":
                return "Recupero le preferenze utente..."

            # Vision Tools
            if "vision" in tool_name or "analyze" in tool_name:
                return "Analisi visiva in corso..."

        except Exception as e:
            logger.warning(f"Error formatting tool message: {e}")
            
        # Default Fallback (generic)
        # return f"Eseguo strumendo: {tool_name}..." 
        return None # Return None to reduce noise if no specific message

    def _get_node_message(self, node_name: str) -> Optional[str]:
        """Maps architectural nodes to user stories."""
        mappings = {
            "reasoning_node": "Rifletto sulla richiesta...",
            "intent_classifier": "Analizzo l'intento...",
            "router": "Pianifico i passaggi successivi...",
            "generate_render": "Preparo l'ambiente di rendering...",
            "analyze_room": "Analizzo la geometria della stanza...",
            "agent": "Elaborazione risposta..." # Sometimes generic agent node
        }
        return mappings.get(node_name)
