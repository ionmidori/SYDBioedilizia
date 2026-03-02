import logging
from typing import List, Union, Dict, Any

logger = logging.getLogger(__name__)

class IntentClassifier:
    """
    Service responsible for classifying the user's intent to determine
    the optimal routing path (e.g., Gatekeeper optimization).
    """

    @staticmethod
    async def classify_intent(messages: List[Union[Dict[str, Any], Any]]) -> str:
        """
        Determines if the request should go to 'reasoning' (slow/methodical)
        or 'execution' (fast/direct).

        Hybrid Approach:
        1. Fast Match: Regex/Heuristics (Zero Latency)
        2. Slow Match: Small LLM (Fallback - To Be Implemented)
        """
        if not messages:
            return "reasoning"

        last_msg = messages[-1]

        # Support both dict messages and objects with .role / .content
        role = last_msg.get("role") if isinstance(last_msg, dict) else getattr(last_msg, "role", None)
        content = last_msg.get("content") if isinstance(last_msg, dict) else getattr(last_msg, "content", "")

        if role != "user":
            return "reasoning"

        # Normalize Content (Handle Multimodal List)
        text_content = ""
        if isinstance(content, str):
            text_content = content
        elif isinstance(content, list):
            text_parts = []
            for part in content:
                if isinstance(part, str):
                    text_parts.append(part)
                elif isinstance(part, dict) and part.get("type") == "text":
                    text_parts.append(part.get("text", ""))
            text_content = " ".join(text_parts)

        # Complexity Check — multimodal or long message → reasoning
        if len(text_content.split()) > 5 or isinstance(content, list):
            return "reasoning"

        # Simple Greeting Fast-Track
        greetings = ["ciao", "hello", "hi", "buongiorno", "buonasera"]
        normalized = text_content.lower().strip()
        if any(normalized.startswith(g) for g in greetings):
            logger.info("[IntentClassifier] Fast-tracking greeting -> execution")
            return "execution"

        return "reasoning"
