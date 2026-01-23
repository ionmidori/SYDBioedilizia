"""
System instruction builder for SYD chatbot.

This module assembles the final prompt from modular components,
ensuring clean separation of concerns and maintainability.
"""

from .components.identity import IDENTITY, CRITICAL_PROTOCOLS, OUTPUT_RULES
from .components.tools import TOOLS
from .components.modes import MODES
from .components.protocol import PROTOCOL
from .components.video import VIDEO_ANALYSIS_PROTOCOL  # 🎬 NEW


def build_system_instruction() -> str:
    """
    Assemble the complete system instruction from components.
    
    Order matters:
    1. Identity - Who is SYD
    2. Critical Protocols - Universal rules
    3. Video Analysis - Temporal understanding (NEW)
    4. Tools - How to use each tool
    5. Modes - Detailed workflows
    6. Protocol - State machine and anti-loop rules
    
    Returns:
        Complete system instruction string
    """
    components = [
        "<!-- SYD SYSTEM INSTRUCTION - MODULAR ARCHITECTURE -->",
        IDENTITY,
        OUTPUT_RULES,
        CRITICAL_PROTOCOLS,
        VIDEO_ANALYSIS_PROTOCOL,  # 🎬 NEW
        TOOLS,
        MODES,
        PROTOCOL,
        "<!-- END SYSTEM INSTRUCTION -->"
    ]
    
    return "\n\n".join(components)


# Export the built instruction
SYSTEM_INSTRUCTION = build_system_instruction()
