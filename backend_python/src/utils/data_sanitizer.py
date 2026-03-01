import re

def sanitize_input(raw_input: str) -> str:
    """
    Basic sanitization to strip out potentially harmful characters or sequences.
    This acts as a first line of defense before passing input to LLM.
    """
    if not isinstance(raw_input, str):
        return str(raw_input)
    
    # Strip basic system prompt injection patterns (naive implementation)
    sanitized = re.sub(r'(?i)(ignore previous instructions|system prompt|admin mode)', '[REDACTED]', raw_input)
    return sanitized
