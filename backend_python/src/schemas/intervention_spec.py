"""Intervention spec of a room, as stored in `projects/{pid}/rooms/{rid}.intervention_spec`
(Phase 140, step 1).

What the quote of the room was computed from: the packages and their conditions,
the client's choice per element, the single extra items, the work outside the
price book and the measures used, each with where it came from. Lines and
quantities are not stored: the code recomputes them from the spec and the
library (`src/services/intervention_expansion.py`).

Written only by the quote tool, apart from `brief` (the background brief refresh
owns that). Backend-only until the confirmation widgets (step 3): `RoomSchema`
leaves it out of every serialization, so it has no TypeScript twin yet.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from src.schemas.assembly_library import ElementAction

# "brief": the measure came from the room brief (scheda stanza), not from the model.
StoredMeasureSource = Literal["declared", "photo", "estimated", "brief"]


class StoredMeasure(BaseModel):
    """A measure a package formula used, with its source."""
    model_config = ConfigDict(extra="forbid")

    name: str
    # Same bound as RoomBrief and SpecMeasure: a home measure.
    value: float = Field(ge=0, le=10_000)
    source: StoredMeasureSource


class StoredPackage(BaseModel):
    """A chosen package of the assembly library and the conditions that hold."""
    model_config = ConfigDict(extra="forbid")

    assembly_id: str
    conditions: list[str] = Field(default_factory=list)


class StoredElementChoice(BaseModel):
    """An element the client keeps or reuses (not stored: replace, the default)."""
    model_config = ConfigDict(extra="forbid")

    element: str
    action: ElementAction


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
    library_version: str
    generated_at: datetime
