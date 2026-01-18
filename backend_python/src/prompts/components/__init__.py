"""
Prompt components package initialization.

Exports the modular prompt components for use by the builder.
"""

from .identity import IDENTITY, CRITICAL_PROTOCOLS
from .tools import TOOLS
from .modes import MODES
from .protocol import PROTOCOL

__all__ = [
    "IDENTITY",
    "CRITICAL_PROTOCOLS", 
    "TOOLS",
    "MODES",
    "PROTOCOL"
]
