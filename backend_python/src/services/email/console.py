"""Console provider: records emails in memory and logs a line (dev, tests,
Firebase emulator E2E). Never contacts a real mailbox."""
from __future__ import annotations

import logging
import uuid

from src.services.email.types import OutboundEmail, ProviderResult

logger = logging.getLogger(__name__)


class ConsoleProvider:
    name = "console"

    def __init__(self) -> None:
        self.sent: list[OutboundEmail] = []

    async def send(self, email: OutboundEmail) -> ProviderResult:
        self.sent.append(email)
        logger.info(
            "[Email/Console] Email recorded (not sent).",
            extra={"reference": email.reference or "-", "attachments": len(email.attachments)},
        )
        return ProviderResult(provider=self.name, message_id=f"<console-{uuid.uuid4().hex}@localhost>")
