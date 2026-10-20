"""Erasure job vocabulary."""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import StrEnum


class ErasureMode(StrEnum):
    ACCOUNT_DELETION = "account_deletion"  # Art. 17 request: everything goes
    INACTIVITY = "inactivity"              # 24 months inactive: a minimal tombstone stays


class ErasureStatus(StrEnum):
    RUNNING = "running"
    FAILED = "failed"        # a step failed; the job is resumed later
    COMPLETED = "completed"


@dataclass
class ErasureReport:
    uid: str
    mode: ErasureMode | None  # None only for a corrupted job document
    status: ErasureStatus
    completed_steps: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)  # per step: items erased (never personal data)
    failed_step: str | None = None
    error_type: str | None = None
