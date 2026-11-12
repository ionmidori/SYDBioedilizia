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

from src.services.company_info_service import CompanyInfoService
from src.utils.data_sanitizer import sanitize_input

logger = logging.getLogger(__name__)

# ─── Output leak patterns ─────────────────────────────────────────────────────
# If ANY of these match the agent output, the entire reply is masked. Each rule
# has a reason, logged instead of the matched text.
_LEAK_RULES: list[tuple[str, re.Pattern]] = [(reason, re.compile(p, re.IGNORECASE | re.DOTALL)) for reason, p in [
    # Python tracebacks (all forms)
    ("traceback", r"Traceback \(most recent call last\)"),
    ("traceback", r"File \".*\.py\", line \d+"),
    # Internal package paths that would reveal server structure
    ("server_path", r"/usr/local/lib/python"),
    ("server_path", r"site-packages/google"),
    ("server_path", r"backend_python/src/"),
    # GCP / Firebase internal IDs leaking from agent errors
    ("gcp_resource", r"projects/[a-z0-9_-]+/databases"),  # Firestore resource path
    ("gcp_resource", r"gs://[a-z0-9_.-]+\.appspot\.com"),  # Storage bucket path leak
    # System prompt boundary spoofing — catches if agent reflects injection attempts
    ("prompt_boundary", r"###\s*(SYSTEM|USER_INPUT|END)\s*###"),
    ("prompt_boundary", r"<\|system\|>"),
    # Agent internal code reflection (defensive)
    ("code", r"```python\n(?:import|from|async def|def )"),
    ("code", r"google\.adk\."),
    ("code", r"google\.cloud\.aiplatform"),
    # PII patterns (defense-in-depth; auth data should never appear in agent output)
    ("fiscal_code", r"\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b"),       # Italian codice fiscale
    ("card_number", r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14})\b"),   # Visa/MC credit card
]]
# Email addresses are PII too, except the company's own ones (see _leak_reason).
_EMAIL_PATTERN = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z]{2,}\b", re.IGNORECASE | re.DOTALL)

_MASKED_REPLY = "Mi dispiace, ho incontrato un problema interno. Come posso aiutarti ulteriormente?"


def _company_emails() -> frozenset[str]:
    """The emails the company info serves now: its contact email and any other
    address written in it (a PEC in a section, an FAQ answer).

    Production, 9 Nov 2026: asked "Come posso contattare la società?", the agent
    answered with the company email and the PII pattern retracted the whole
    reply ("ho incontrato un problema interno"). The company's emails are public
    and are what the agent must give. They are read from the company info
    (edited only in the admin console), never a constant; every other email,
    a customer's included, is still masked.
    """
    info = CompanyInfoService.snapshot()
    found = {m.group(0).lower() for m in _EMAIL_PATTERN.finditer(info.model_dump_json())}
    return frozenset(found | {info.identity.email.lower()})


def _leak_reason(text: str, allowed_emails: frozenset[str], *, final: bool) -> str | None:
    """Why `text` leaks (a rule's reason, or "email"), None when it is clean.

    While streaming (`final=False`), an email at the very end of the text that
    is the beginning of an allowed one is still being written: not a leak yet.
    """
    for reason, pattern in _LEAK_RULES:
        if pattern.search(text):
            return reason
    for match in _EMAIL_PATTERN.finditer(text):
        email = match.group(0).lower()
        if email in allowed_emails:
            continue
        if not final and match.end() == len(text) and any(a.startswith(email) for a in allowed_emails):
            continue
        return "email"
    return None


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
    - PII (email, fiscal codes, credit card numbers); the company's own
      contact email is allowed (see _company_emails)

    Args:
        raw_output: The raw text from the ADK agent.

    Returns:
        Safe output text, or a generic error message if a leak is detected.
    """
    reason = _leak_reason(raw_output, _company_emails(), final=True)
    if reason is not None:
        logger.warning("Detected potential sensitive data leak in ADK output (%s). Masking.", reason)
        return _MASKED_REPLY
    return raw_output


# Streaming holdback. Some leak patterns span several words
# (`File "/app/src/x.py", line 12`, `Traceback (most recent call last)`), so
# holding back only the token being written is not enough: the last
# _STREAM_HOLDBACK_CHARS characters are never released before the next chunk
# (or the end of the call) lets the patterns see what follows them.
_STREAM_HOLDBACK_CHARS = 120
# Upper bound on the text held back when the tail is one very long token;
# keeps the stream moving on pathological output.
_MAX_HOLDBACK_CHARS = 200


class StreamingOutputGuard:
    """`filter_agent_output` for token streaming, one instance per model call.

    Chunk-by-chunk filtering would let a leak through when it is split across
    two chunks (``mario.rossi@`` + ``example.com``). The guard instead:

    - checks the leak patterns against the WHOLE text accumulated so far;
    - releases text only up to the last whitespace AND at least
      _STREAM_HOLDBACK_CHARS behind the end: the token still being written
      (email, fiscal code, card number) and multi-word patterns (a traceback
      `File "...", line N`) are held back until they are complete;
    - once a pattern matches, emits nothing more and reports `tripped`, so the
      caller can retract what was already shown (see `stream_redact`).

    The company's own emails are not a leak (read once per model call); while one
    is still being written its beginning is held back, not retracted.
    """

    def __init__(self) -> None:
        self.raw = ""        # everything received for this model call
        self.emitted = ""    # what has been released to the client
        self.tripped = False
        self._allowed_emails = _company_emails()

    @property
    def started(self) -> bool:
        return bool(self.raw)

    def _leaks(self, *, final: bool) -> bool:
        reason = _leak_reason(self.raw, self._allowed_emails, final=final)
        if reason is not None:
            logger.warning("Detected potential sensitive data leak in streamed ADK output (%s). Retracting.", reason)
        return reason is not None

    def feed(self, chunk: str) -> str:
        """Add a chunk; return the newly releasable text ("" if none)."""
        if self.tripped or not chunk:
            return ""
        self.raw += chunk
        if self._leaks(final=False):
            self.tripped = True
            return ""
        # Last word boundary at least _STREAM_HOLDBACK_CHARS before the end, so a
        # release never splits a token.
        limit = len(self.raw) - _STREAM_HOLDBACK_CHARS
        cut = max(
            self.raw.rfind(" ", 0, limit),
            self.raw.rfind("\n", 0, limit),
            self.raw.rfind("\t", 0, limit),
        )
        safe_end = cut + 1 if limit > 0 and cut >= 0 else 0
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
        if self._leaks(final=True):
            self.tripped = True
            return ""
        tail = self.raw[len(self.emitted):]
        self.emitted = self.raw
        return tail


MASKED_REPLY = _MASKED_REPLY
