"""
Admin console API schemas — portfolio, testimonials, batches, KPIs, GDPR
(Phase 128, Fase 6.1b).

Golden Sync: web_client/types/admin-content.ts (1:1).
"""
from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Literal
from urllib.parse import unquote, urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.core.money import Money
from src.schemas.quote import QuoteDeliveryStatusType, QuoteStatusType

# ── Portfolio ─────────────────────────────────────────────────────────────────

PORTFOLIO_CATEGORIES = (
    "Soggiorno",
    "Cucina",
    "Bagno",
    "Camera da letto",
    "Ufficio",
    "Intero Appartamento",
    "Esterni",
    "Altro",
)
PORTFOLIO_FOLDER = "portfolio"


# Characters that never belong in one of our image URLs (a backslash is a slash to a browser).
_FORBIDDEN_CHARS = frozenset(chr(c) for c in (92, 34, 60, 62, 39, 96, 94, 124, 123, 125))
_FILE_PATH = re.compile(r"^portfolio/[A-Za-z0-9][A-Za-z0-9._-]{0,150}$")
_RAW_OBJECT = re.compile(r"^[A-Za-z0-9._%/-]+$")
_ALLOWED_QUERIES = frozenset({"", "alt=media"})


def portfolio_blob_path(url: str, bucket: str) -> str | None:
    """Storage path of a portfolio image URL of OUR bucket, else None.

    Accepted forms (both end up in `portfolio/<file>`):
      https://firebasestorage.googleapis.com/v0/b/{bucket}/o/portfolio%2F<file>[?alt=media]
      https://storage.googleapis.com/{bucket}/portfolio/<file>

    The URL is rendered on the public landing page, so it is validated as a
    STRING, not only as parsed by Python: browsers read URLs differently from
    `urlparse` (a backslash is a slash, userinfo and ports change the host, a
    space or a control character is stripped). Anything outside the plain
    ASCII shape above — userinfo, port, fragment, backslash, whitespace,
    upper-case host, double encoding, nested paths — is refused.
    """
    if not url or len(url) > 1000 or not bucket or not url.isascii():
        return None
    if any(ord(c) <= 32 or ord(c) == 127 or c in _FORBIDDEN_CHARS for c in url):
        return None
    try:
        parsed = urlparse(url)
    except ValueError:
        return None
    # netloc must be exactly the lower-case host: no userinfo, no port.
    if parsed.scheme != "https" or parsed.fragment or parsed.params or parsed.netloc != (parsed.hostname or ""):
        return None
    if parsed.query not in _ALLOWED_QUERIES:
        return None
    if parsed.hostname == "firebasestorage.googleapis.com":
        prefix = f"/v0/b/{bucket}/o/"
    elif parsed.hostname == "storage.googleapis.com":
        prefix = f"/{bucket}/"
        if parsed.query:
            return None
    else:
        return None
    if not parsed.path.startswith(prefix):
        return None
    raw = parsed.path[len(prefix):]
    if not _RAW_OBJECT.match(raw):
        return None
    path = unquote(raw)
    # One level of decoding only: a '%' left over means double encoding.
    return path if "%" not in path and _FILE_PATH.match(path) else None


class PortfolioStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    area: str = Field(default="", max_length=40)
    duration: str = Field(default="", max_length=40)
    budget: str = Field(default="", max_length=40)


class PortfolioWrite(BaseModel):
    """Create/replace body. `image_url` must be an image uploaded to `portfolio/`."""

    model_config = ConfigDict(extra="forbid")

    title: str = Field(..., min_length=1, max_length=120)
    category: Literal[
        "Soggiorno", "Cucina", "Bagno", "Camera da letto", "Ufficio", "Intero Appartamento", "Esterni", "Altro"
    ]
    location: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    stats: PortfolioStats = Field(default_factory=PortfolioStats)
    image_url: str = Field(..., min_length=1, max_length=1000)
    active: bool = True

    @field_validator("title", "location", "description")
    @classmethod
    def _strip(cls, value: str) -> str:
        return value.strip()

    @field_validator("title", "location")
    @classmethod
    def _not_blank(cls, value: str) -> str:
        if not value:
            raise ValueError("Cannot be blank.")
        return value


class PortfolioPatch(BaseModel):
    """Partial update: only the fields sent are changed."""

    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(default=None, min_length=1, max_length=120)
    category: (
        Literal["Soggiorno", "Cucina", "Bagno", "Camera da letto", "Ufficio", "Intero Appartamento", "Esterni", "Altro"]
        | None
    ) = None
    location: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    stats: PortfolioStats | None = None
    image_url: str | None = Field(default=None, min_length=1, max_length=1000)
    active: bool | None = None
    order: int | None = Field(default=None, ge=1, le=10_000)

    @model_validator(mode="after")
    def _something_to_change(self) -> PortfolioPatch:
        if not self.model_fields_set:
            raise ValueError("Send at least one field to change.")
        # "Not sent" means unchanged; an explicit null would blank a field the
        # public site renders (and used to break the whole gallery).
        nulled = sorted(name for name in self.model_fields_set if getattr(self, name) is None)
        if nulled:
            raise ValueError(f"Fields cannot be null: {', '.join(nulled)}.")
        return self


class PortfolioProject(BaseModel):
    id: str
    title: str
    category: str
    location: str
    description: str = ""
    stats: PortfolioStats = Field(default_factory=PortfolioStats)
    image_url: str | None = None
    active: bool = True
    order: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class PortfolioImageUploaded(BaseModel):
    """A processed image, stored in `portfolio/`; pass `image_url` when saving the project."""

    image_url: str
    width: int
    height: int
    size_bytes: int


class PortfolioList(BaseModel):
    items: list[PortfolioProject]
    visible: int


# ── Testimonials ──────────────────────────────────────────────────────────────

TestimonialStatus = Literal["pending", "approved", "rejected"]


class AdminTestimonial(BaseModel):
    id: str
    name: str
    location: str = ""
    text: str
    rating: int = 5
    status: TestimonialStatus
    admin_notes: str | None = None
    created_at: datetime | None = None
    reviewed_at: datetime | None = None


class TestimonialStats(BaseModel):
    pending: int = 0
    approved: int = 0
    rejected: int = 0


class TestimonialList(BaseModel):
    items: list[AdminTestimonial]
    stats: TestimonialStats


class ModerateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")

    decision: Literal["approve", "reject"]
    notes: str | None = Field(default=None, max_length=500)


class ModerateResponse(BaseModel):
    id: str
    status: TestimonialStatus
    stats: TestimonialStats


# ── Batches ───────────────────────────────────────────────────────────────────

BatchStatus = Literal["draft", "submitted", "partially_approved", "approved", "rejected"]


class AdminBatchListItem(BaseModel):
    batch_id: str
    status: BatchStatus
    client_display_name: str | None = None
    client_email: str | None = None
    total_projects: int = 0
    decided_projects: int = 0
    batch_grand_total: Money = Decimal("0.00")
    potential_savings: Money = Decimal("0.00")
    submitted_at: datetime | None = None


class AdminBatchList(BaseModel):
    items: list[AdminBatchListItem]


class AdminBatchProject(BaseModel):
    """A project of the batch with the LIVE state of its quote.

    Decisions are taken in the quote dossier (/admin/quotes/{project_id}),
    where the admin sees photos and lines and chooses what to send.
    """

    project_id: str
    project_name: str
    batch_status: QuoteStatusType
    quote_status: QuoteStatusType | None = None
    delivery_status: QuoteDeliveryStatusType = "none"
    quote_number: str | None = None
    item_count: int = 0
    grand_total: Money = Decimal("0.00")
    admin_notes: str | None = None


class AdminBatchDetail(BaseModel):
    batch_id: str
    status: BatchStatus
    client_display_name: str | None = None
    client_email: str | None = None
    batch_subtotal: Money = Decimal("0.00")
    batch_grand_total: Money = Decimal("0.00")
    potential_savings: Money = Decimal("0.00")
    submitted_at: datetime | None = None
    aggregation_preview: list[dict[str, object]] = Field(default_factory=list)
    projects: list[AdminBatchProject]


# ── KPIs ──────────────────────────────────────────────────────────────────────


class RecentApproval(BaseModel):
    project_id: str
    quote_number: str | None = None
    client_display_name: str | None = None
    grand_total: Money = Decimal("0.00")
    approved_at: datetime | None = None


class WeeklyApprovals(BaseModel):
    week_start: str  # ISO date of the Monday
    approvals: int


class AdminKpis(BaseModel):
    by_status: dict[str, int]
    pending_value: Money
    pending_truncated: bool = False
    weekly_approvals: list[WeeklyApprovals]
    recent_approvals: list[RecentApproval]
    testimonials: TestimonialStats
    generated_at: datetime


# ── GDPR ──────────────────────────────────────────────────────────────────────


class GdprPhase(BaseModel):
    phase: int
    months_inactive: int
    action: str


class GdprStatus(BaseModel):
    phases: list[GdprPhase]
    scheduler_secret_configured: bool


class RetentionSummary(BaseModel):
    """What the retention phase erased. With `orphans_applied` false the orphan
    purge is off and `orphans` is what it would erase. Its errors are part of
    the run's `errors`."""

    model_config = ConfigDict(from_attributes=True)

    orphans_applied: bool
    guest_sessions: int
    deleted_projects: int
    expired_holds: int
    orphans: int
    orphans_kept: int
    made_permanent: int
    truncated: bool


class GdprRunResult(BaseModel):
    status: str
    warned: int
    disabled: int
    anonymized: int
    errors: list[str]
    retention: RetentionSummary | None  # None: the retention phase did not run
