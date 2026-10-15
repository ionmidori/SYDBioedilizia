"""
Prompt components package initialization.

Exports the modular prompt components composed by ``src/adk/agents.py``.
"""

from .identity import CRITICAL_PROTOCOLS, IDENTITY
from .modes import MODES
from .protocol import PROTOCOL

__all__ = [
    "IDENTITY",
    "CRITICAL_PROTOCOLS",
    "MODES",
    "PROTOCOL"
]
