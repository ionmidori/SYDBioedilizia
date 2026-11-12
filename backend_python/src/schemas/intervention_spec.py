"""Intervention spec of a room, as stored in `projects/{pid}/rooms/{rid}.intervention_spec`
(Phase 140, step 1).

What the quote of the room was computed from: the packages and their conditions,
the client's choice per element, the single extra items, the work outside the
price book and the measures used, each with where it came from. Lines and
quantities are not stored: the code recomputes them from the spec and the
library (`src/services/intervention_expansion.py`).

Written by the quote tool and by the client's confirmation cards (step 3); the
background brief refresh owns `brief` only. `RoomSchema` leaves the spec out of
every serialization: the client reads it through the confirmation API.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.schemas.assembly_library import ElementAction

# "brief": the measure came from the room brief (scheda stanza), not from the model.
# "confirmed": the client confirmed it on the card; only the card writes it.
StoredMeasureSource = Literal["declared", "photo", "estimated", "brief", "confirmed"]


class StoredMeasure(BaseModel):
    """A measure a package formula used, with its source."""
    model_config = ConfigDict(extra="forbid")

    name: str
    # Same bound as RoomBrief and SpecMeasure: a home measure.
    value: float = Field(ge=0, le=10_000)
    source: StoredMeasureSource
    # A confirmed measure the model later gave with another value: shown to the
    # client as a proposal, never used until the client confirms it.
    proposed: float | None = Field(default=None, ge=0, le=10_000)


class StoredPackage(BaseModel):
    """A chosen package of the assembly library and the conditions that hold."""
    model_config = ConfigDict(extra="forbid")

    assembly_id: str
    conditions: list[str] = Field(default_factory=list)


class StoredElementChoice(BaseModel):
    """An element the client keeps or reuses, or any choice the client confirmed.

    "replace" is the default and is stored only when the client confirmed it."""
    model_config = ConfigDict(extra="forbid")

    element: str
    action: ElementAction
    # Chosen by the client on the card: a new analysis cannot change it.
    confirmed: bool = False


class StoredExtraItem(BaseModel):
    """A single price-book item outside the chosen packages, with the model's quantity."""
    model_config = ConfigDict(extra="forbid")

    sku: str
    qty: float = Field(ge=0)


class RoomInterventionSpec(BaseModel):
    """The spec the room's quote was expanded from."""
    model_config = ConfigDict(extra="forbid")

    measures: list[StoredMeasure] = Field(default_factory=list)
    packages: list[StoredPackage] = Field(default_factory=list)
    element_choices: list[StoredElementChoice] = Field(default_factory=list)
    extra_items: list[StoredExtraItem] = Field(default_factory=list)
    unmapped_work_requests: list[str] = Field(default_factory=list)
    # Measures a formula needed and nobody gave: the card asks for them.
    missing_measures: list[str] = Field(default_factory=list)
    # Measure → the different values the model gave for it (several rooms in one unit?).
    conflicts: dict[str, list[float]] = Field(default_factory=dict)
    library_version: str
    generated_at: datetime
