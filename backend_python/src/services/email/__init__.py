"""Transactional email platform (Phase 128 — Fase 4): provider contract,
SMTP / Brevo / Console providers, outbox dispatcher."""
from __future__ import annotations

from functools import lru_cache

from src.core.config import settings
from src.services.email.brevo import BrevoProvider
from src.services.email.console import ConsoleProvider
from src.services.email.smtp import SmtpProvider
from src.services.email.types import EmailProvider


@lru_cache(maxsize=1)
def get_email_provider() -> EmailProvider:
    """The provider selected by EMAIL_PROVIDER (smtp by default)."""
    if settings.EMAIL_PROVIDER == "brevo":
        return BrevoProvider()
    if settings.EMAIL_PROVIDER == "console":
        return ConsoleProvider()
    return SmtpProvider()
