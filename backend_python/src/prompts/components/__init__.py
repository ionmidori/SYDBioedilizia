"""
Prompt components package initialization.

Exports the modular prompt components for use by the builder.
"""

from .identity import CRITICAL_PROTOCOLS, IDENTITY
from .modes import MODES
from .protocol import PROTOCOL
from .tools import TOOLS

__all__ = [
    "IDENTITY",
    "CRITICAL_PROTOCOLS",
    "TOOLS",
    "MODES",
    "PROTOCOL"
]
