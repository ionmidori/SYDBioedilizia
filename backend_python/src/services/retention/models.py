from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RetentionReport:
    """What one retention run erased — or, in a dry run (`applied=False`), would erase."""

    applied: bool
    guest_sessions: int = 0    # guest projects past their 30-day expiry
    deleted_projects: int = 0  # projects in the bin for more than 30 days
    expired_holds: int = 0     # sent quotes past their 10-year legal hold
    orphans: int = 0           # remains of projects whose session no longer exists
    orphans_kept: int = 0      # remains left in place: they belong to a registered account
    made_permanent: int = 0    # registered sessions found with a guest expiry (expiry removed)
    truncated: bool = False    # time or size budget reached: the rest waits for the next run
    errors: list[str] = field(default_factory=list)
