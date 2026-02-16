import logging
from typing import List, Union, Dict, Any
from langchain_core.messages import BaseMessage, HumanMessage

logger = logging.getLogger(__name__)

class IntentClassifier:
    """
    Service responsible for classifying the user's intent to determine
    the optimal routing path (e.g., Gatekeeper optimization).
    """

    @staticmethod
    async def classify_intent(messages: List[BaseMessage]) -> str:
        """
        Determines if the request should go to 'reasoning' (slow/methodical)
        or 'execution' (fast/direct).
        
        Hybrid Approach:
        1. Fast Match: Regex/Heuristics (Zero Latency)
        2. Slow Match: Small LLM (Fallback - To Be Implemented)
        """
        if not messages: return "reasoning"
        
        last_msg = messages[-1]
        
        # Only analyze Human inputs for fast-tracking
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
            
            # 2. Heuristic Checks
            
            # A. Complexity Check (Length)
            # If > 5 words, likely needs reasoning.
            if len(text_content.split()) > 5:
                # If multimodal (list), default to reasoning as it implies complexity
                if isinstance(content, list):
                    return "reasoning"
                return "reasoning"
                
            # B. Simple interaction Check (Greetings ONLY)
            # 🛑 CRITICAL FIX: Removed 'ok', 'va bene', 'grazie' to force Reasoning Node.
            # We NEED the Reasoning Node to trigger the "God Mode" logic in modes.py for confirmations.
            greetings = ["ciao", "hello", "hi", "buongiorno", "buonasera"]
            normalized = text_content.lower().strip()
            
            # Exact match or starts with greeting
            if any(normalized.startswith(g) for g in greetings):
                logger.info("🚀 IntentClassifier: Fast-tracking greeting -> Execution Node")
                return "execution"
        
        # TODO: Implement Hybrid LLM Fallback here if needed
        # if logic_is_ambiguous:
        #      return await call_small_llm_classifier(messages)
        
        return "reasoning"
