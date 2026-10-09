"""
Input Sanitization & Output Filtering for the ADK Flow.

Security boundaries:
- sanitize_before_agent(): OWASP LLM01 — prompt injection prevention
- filter_agent_output(): OWASP LLM02 — insecure output prevention
  Catches: Python tracebacks, GCP/Firebase internals, PII patterns,
  system prompt boundary leaks, internal package paths.
"""
import logging
import re

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


# Upper bound on the text held back while streaming when the tail contains no
# whitespace (a long token); keeps memory bounded on pathological output.
_MAX_HOLDBACK_CHARS = 200


class StreamingOutputGuard:
    """`filter_agent_output` for token streaming, one instance per model call.

    Chunk-by-chunk filtering would let a leak through when it is split across
    two chunks (``mario.rossi@`` + ``example.com``). The guard instead:

    - checks the leak patterns against the WHOLE text accumulated so far;
    - releases text up to the last whitespace only: the token still being
      written (email, fiscal code, card number, path) is held back until it is
      complete, so it is never emitted half-way;
    - once a pattern matches, emits nothing more and reports `tripped`, so the
      caller can retract what was already shown (see `stream_redact`).
    """

    def __init__(self) -> None:
        self.raw = ""        # everything received for this model call
        self.emitted = ""    # what has been released to the client
        self.tripped = False

    @property
    def started(self) -> bool:
        return bool(self.raw)

    def _leaks(self) -> bool:
        return any(pattern.search(self.raw) for pattern in _LEAK_PATTERNS)

    def feed(self, chunk: str) -> str:
        """Add a chunk; return the newly releasable text ("" if none)."""
        if self.tripped or not chunk:
            return ""
        self.raw += chunk
        if self._leaks():
            self.tripped = True
            logger.warning("Detected potential sensitive data leak in streamed ADK output. Retracting.")
            return ""
        cut = max(self.raw.rfind(" "), self.raw.rfind("\n"), self.raw.rfind("\t"))
        safe_end = cut + 1 if cut >= 0 else 0
        safe_end = max(safe_end, len(self.raw) - _MAX_HOLDBACK_CHARS)
        if safe_end <= len(self.emitted):
            return ""
        released = self.raw[len(self.emitted):safe_end]
        self.emitted += released
        return released

    def finish(self) -> str:
        """End of the model call: release the held-back tail if still clean."""
        if self.tripped:
            return ""
        if self._leaks():
            self.tripped = True
            return ""
        tail = self.raw[len(self.emitted):]
        self.emitted = self.raw
        return tail


MASKED_REPLY = _MASKED_REPLY
