from typing import Dict

from .builder import SYSTEM_INSTRUCTION


class SystemPrompts:
    """
    Central manager for system prompts.
    Provides access to system instructions with versioning support for A/B testing.
    """

    # Store variations here (could be loaded from DB/Config later)
    _VERSIONS: Dict[str, str] = {
        "default": SYSTEM_INSTRUCTION,
        "v1": SYSTEM_INSTRUCTION, # Alias
        # "v2_experimental": ... (Example)
    }

    @classmethod
    def get_instruction(cls, version: str = "default") -> str:
        """
        Retrieve the system instruction for a specific version.
        Defaults to 'default' if version not found.
        """
        return cls._VERSIONS.get(version, cls._VERSIONS["default"])
