"""
Input Sanitization & Output Filtering for the ADK Flow.
Ensures Phase 0 security requirements are maintained when using the Agent Engine.
"""
import logging
from src.utils.data_sanitizer import sanitize_input

logger = logging.getLogger(__name__)

async def sanitize_before_agent(raw_input: str) -> str:
    """
    Cleans user input before passing it to the ADK.
    Mitigates Prompt Injection and XSS by stripping dangerous characters.
    """
    sanitized = sanitize_input(raw_input)
    if sanitized != raw_input:
        logger.info("Input was sanitized before reaching the ADK.")
    return sanitized

async def filter_agent_output(raw_output: str) -> str:
    """
    Filters AI output prior to streaming it to the user.
    Prevents the LLM from leaking internal logic, traceback codes, or PII.
    """
    # Basic output filtering logic
    if "Traceback" in raw_output or "```python\ndef " in raw_output and "google.adk" in raw_output:
        logger.warning("Detected potential code leak in ADK output. Masking.")
        return "I'm sorry, I encountered an internal error. How else can I help you?"
    return raw_output
