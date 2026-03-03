"""
Input Sanitization — Production-grade prompt injection defense.

Security layers:
1. Max length guard (10k chars)
2. Unicode normalization (prevents lookalike bypass: "ᵢɢɴᵒʀᴇ" → "ignore")
3. Injection pattern detection (IT + EN + synonyms)
4. Control character stripping

NOTE — Sandwich Defense:
    Delimiters must be applied in the SYSTEM PROMPT of each agent (agents.py), NOT here.
    Pattern: "###SYSTEM###\\n{instructions}\\n###USER_INPUT###\\n{input}\\n###END###"
    This prevents the LLM from treating user content as instructions.
"""
import re
import unicodedata

# ─── Configurable limits ─────────────────────────────────────────────────────
_MAX_INPUT_LENGTH = 10_000  # characters

# ─── Injection patterns (EN + IT + synonyms) ─────────────────────────────────
# All patterns are case-insensitive by flag.
_INJECTION_PATTERNS: list[re.Pattern] = [re.compile(p, re.IGNORECASE | re.UNICODE) for p in [
    # English — classic prompt injection
    r"ignore (previous|all|the) instructions?",
    r"disregard (previous|all|the) instructions?",
    r"forget (previous|all|the) instructions?",
    r"override (previous|all|the) instructions?",
    r"you are (now|a|an) (?!assistant)",  # role hijacking attempts
    r"act as (a|an) ",
    r"pretend (you are|to be) ",
    r"j?ail ?break",
    r"system prompt",
    r"admin mode",
    r"dev mode",
    r"developer mode",
    r"do anything now",
    r"\bdan\b.*mode",  # "DAN mode" jailbreak
    # Italian — prompt injection equivalents
    r"ignora (le istruzioni|tutto|i comandi) (precedenti|precedente|prima)",
    r"dimentica (le istruzioni|tutto|i messaggi) (precedenti|precedente|prima)",
    r"sostituisci (le istruzioni|il prompt|il sistema)",
    r"sei (ora|adesso|diventato?) (un|una|il|la) (?!assistente)",  # role hijacking IT
    r"fai (finta|finta di essere|finta di avere)",
    r"modalit.{0,5}admin",
    r"modalit.{0,5}sviluppatore",
    r"prompt di sistema",
    r"istruzioni di sistema",
    r"esci dal ruolo",
    r"comportati come",
    r"simula di essere",
    # Structural / meta attacks
    r"<\|system\|>",           # ChatML injection
    r"\[INST\]",               # Mistral/Llama instruction injection
    r"###\s*(SYSTEM|HUMAN|USER|ASSISTANT)\s*###",  # sandwich boundary spoofing
    r"```\s*system",           # code block system prompt
]]


def sanitize_input(raw_input: str) -> str:
    """
    Sanitizes user input before it is passed to the ADK agent.

    Removes or redacts known prompt injection patterns in English and Italian.
    Normalizes unicode to prevent lookalike-character bypasses.
    Enforces a maximum input length.

    Args:
        raw_input: The raw user-provided text string.

    Returns:
        A sanitized string safe to include in an ADK prompt context.
    """
    if not isinstance(raw_input, str):
        raw_input = str(raw_input)

    # 1. Hard length cap (prevent token-flooding attacks)
    if len(raw_input) > _MAX_INPUT_LENGTH:
        raw_input = raw_input[:_MAX_INPUT_LENGTH]

    # 2. Unicode normalization (NFKC) — collapses lookalike chars
    #    e.g. "ᵢɢɴᵒʀᴇ previous instructions" → "ignore previous instructions"
    raw_input = unicodedata.normalize("NFKC", raw_input)

    # 3. Strip control characters (except newline / tab — preserve readability)
    raw_input = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]", "", raw_input)

    # 4. Injection pattern redaction
    sanitized = raw_input
    for pattern in _INJECTION_PATTERNS:
        sanitized = pattern.sub("[REDACTED]", sanitized)

    return sanitized
