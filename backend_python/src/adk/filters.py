"""
Input Sanitization & Output Filtering for the ADK Flow.

Security boundaries:
- sanitize_before_agent(): OWASP LLM01 — prompt injection prevention
- filter_agent_output(): OWASP LLM02 — insecure output prevention
  Catches: Python tracebacks, GCP/Firebase internals, PII patterns,
  system prompt boundary leaks, internal package paths.
"""
import re
import logging
from src.utils.data_sanitizer import sanitize_input

logger = logging.getLogger(__name__)

# ─── Output leak patterns ─────────────────────────────────────────────────────
# If ANY of these match the agent output, the entire reply is masked.
_LEAK_PATTERNS: list[re.Pattern] = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in [
    # Python tracebacks (all forms)
    r"Traceback \(most recent call last\)",
    r"File \".*\.py\", line \d+",
    # Internal package paths that would reveal server structure
    r"/usr/local/lib/python",
    r"site-packages/google",
    r"backend_python/src/",
    # GCP / Firebase internal IDs leaking from agent errors
    r"projects/[a-z0-9_-]+/databases",  # Firestore resource path
    r"gs://[a-z0-9_.-]+\.appspot\.com",  # Storage bucket path leak
    # System prompt boundary spoofing — catches if agent reflects injection attempts
    r"###\s*(SYSTEM|USER_INPUT|END)\s*###",
    r"<\|system\|>",
    # Agent internal code reflection (defensive)
    r"```python\n(?:import|from|async def|def )",
    r"google\.adk\.",
    r"google\.cloud\.aiplatform",
    # PII patterns (defense-in-depth; auth data should never appear in agent output)
    r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b",  # email
    r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b",       # Italian codice fiscale
    r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b",   # Visa/MC credit card
]]

_MASKED_REPLY = "Mi dispiace, ho incontrato un problema interno. Come posso aiutarti ulteriormente?"


async def sanitize_before_agent(raw_input: str) -> str:
    """
    Cleans user input before passing it to the ADK.
    Mitigates Prompt Injection (OWASP LLM01) by stripping dangerous patterns.

    Args:
        raw_input: The raw user text.

    Returns:
        Sanitized text ready for the ADK agent.
    """
    sanitized = sanitize_input(raw_input)
    if sanitized != raw_input:
        logger.info("Input was sanitized before reaching the ADK.", extra={"redacted": True})
    return sanitized


async def filter_agent_output(raw_output: str) -> str:
    """
    Filters AI output prior to streaming it to the user.

    Prevents the LLM from leaking:
    - Python tracebacks and internal file paths (OWASP LLM02)
    - GCP/Firebase resource identifiers
    - System prompt boundary markers
    - PII (email, fiscal codes, credit card numbers)

    Args:
        raw_output: The raw text from the ADK agent.

    Returns:
        Safe output text, or a generic error message if a leak is detected.
    """
    for pattern in _LEAK_PATTERNS:
        if pattern.search(raw_output):
            logger.warning(
                "Detected potential sensitive data leak in ADK output. Masking.",
                extra={"pattern": pattern.pattern[:60]},
            )
            return _MASKED_REPLY
    return raw_output
