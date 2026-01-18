"""
System instruction for SYD chatbot - Modular Architecture (Refactored).

LEGACY VERSION: The monolithic 530-line string has been refactored into
a modular architecture for better maintainability and extensibility.

NEW ARCHITECTURE:
- src/prompts/components/identity.py  - Core persona and protocols
- src/prompts/components/tools.py     - Tool usage instructions
- src/prompts/components/modes.py     - Designer & Surveyor workflows
- src/prompts/components/protocol.py  - State machine and anti-loop rules
- src/prompts/builder.py              - Assembly logic

This module maintains backward compatibility by exporting SYSTEM_INSTRUCTION
exactly as before, but now built from components.
"""

from .builder import SYSTEM_INSTRUCTION

# Backward compatibility: agent.py imports from this module
__all__ = ["SYSTEM_INSTRUCTION"]

# Development note: To modify the prompt, edit the relevant component file
# instead of changing this monolithic string.
