"""
Provider-agnostic email contract (Phase 128 — Fase 4).

Every transactional email of the quote flow is an `OutboundEmail` handed to an
`EmailProvider` by the outbox dispatcher (`src/services/email/outbox.py`).
Providers: SMTP (Gmail today), Brevo (EU, once the domain is configured),
Console (tests / local emulators). Switching is one setting: EMAIL_PROVIDER.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal, Protocol

DeliveryEventType = Literal["delivered", "bounced", "soft_bounced", "complained", "opened", "deferred", "failed"]


@dataclass(frozen=True)
class Attachment:
    filename: str
    content: bytes
    mime_type: str = "application/pdf"


@dataclass(frozen=True)
class OutboundEmail:
    to: str
    subject: str
    text: str
    html: str | None = None
    cc: tuple[str, ...] = ()
    attachments: tuple[Attachment, ...] = ()
    # mailto: address for List-Unsubscribe (client-facing mail only).
    list_unsubscribe: str | None = None
    # Correlation id echoed back by provider webhooks (Brevo X-Mailin-custom).
    reference: str | None = None
    tags: tuple[str, ...] = ()


@dataclass(frozen=True)
class ProviderResult:
    provider: str
    message_id: str


@dataclass(frozen=True)
class DeliveryEvent:
    """A provider-reported outcome for one message (from a webhook)."""
    provider: str
    message_id: str
    event: DeliveryEventType
    occurred_at: datetime
    detail: str = ""
    reference: str | None = None
    raw_event: str = ""


@dataclass
class ProviderError(Exception):
    """Send failure. `permanent=True` means retrying cannot help (bad recipient,
    rejected content, auth/config error): the dispatcher dead-letters at once."""
    message: str
    permanent: bool = False
    status_code: int | None = None
    extra: dict[str, str] = field(default_factory=dict)

    def __str__(self) -> str:
        return self.message


class EmailProvider(Protocol):
    name: str

    async def send(self, email: OutboundEmail) -> ProviderResult:
        """Send one email; raise ProviderError on failure."""
        ...
