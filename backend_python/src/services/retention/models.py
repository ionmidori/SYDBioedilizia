from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RetentionReport:
    """What one retention run erased. Orphans are only counted while their
    purge is off (`orphans_applied` false): the number is what would be erased."""

    orphans_applied: bool
    guest_sessions: int = 0    # guest projects past their 30-day expiry
    expired_holds: int = 0     # sent quotes past their 10-year legal hold
    orphans: int = 0           # remains of projects whose session no longer exists
    orphans_kept: int = 0      # remains left in place: they belong to a registered account
    made_permanent: int = 0    # registered sessions found with a guest expiry (expiry removed)
    truncated: bool = False    # time or size budget reached: the rest waits for the next run
    errors: list[str] = field(default_factory=list)
