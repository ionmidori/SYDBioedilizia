"""The confirmation card (Phase 140, step 3): what the client confirms, and what the card shows.

The client confirms, per quote unit (section), the measures the lines are
computed from and what to do with each existing element. No amount ever: the
card shows the precision of the price range only.
"""
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from src.schemas.assembly_library import FORMULA_VARIABLES, ElementAction
from src.schemas.intervention_spec import MeasureValue, StoredMeasureSource

# Elements of the chosen packages a section can list (the library has far fewer).
_MAX_CHOICES = 32


class MeasureConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    value: MeasureValue

    @field_validator("name")
    @classmethod
    def _formula_measure(cls, name: str) -> str:
        if name not in FORMULA_VARIABLES:
            raise ValueError("not a measure of the package formulas")
        return name


class ChoiceConfirmation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    element: str = Field(min_length=1, max_length=64)
    action: ElementAction


class ConfirmationUpdate(BaseModel):
    """What the client confirms for one section: at least one measure or choice, each once."""
    model_config = ConfigDict(extra="forbid")

    measures: list[MeasureConfirmation] = Field(default_factory=list, max_length=len(FORMULA_VARIABLES))
    element_choices: list[ChoiceConfirmation] = Field(default_factory=list, max_length=_MAX_CHOICES)

    @model_validator(mode="after")
    def _something_once(self) -> Self:
        if not self.measures and not self.element_choices:
            raise ValueError("nothing to confirm")
        names = [m.name for m in self.measures]
        elements = [c.element for c in self.element_choices]
        if len(set(names)) != len(names) or len(set(elements)) != len(elements):
            raise ValueError("a measure or an element confirmed twice")
        return self


class MeasureState(BaseModel):
    """A measure of a section as the card shows it. `value` None: nobody gave it yet."""
    model_config = ConfigDict(extra="forbid")

    name: str
    label: str
    value: float | None
    source: StoredMeasureSource | None
    # A new value from the model after the client confirmed this one.
    proposed: float | None = None
    # The different values the model gave (quick picks): maybe different rooms.
    candidates: list[float] = Field(default_factory=list)


class ElementOption(BaseModel):
    """One action the client can choose, in the words the team reads in its checks."""
    model_config = ConfigDict(extra="forbid")

    action: ElementAction
    label: str


class ElementChoiceState(BaseModel):
    """What happens to an existing element; `options` are the actions the library allows."""
    model_config = ConfigDict(extra="forbid")

    element: str
    label: str
    action: ElementAction
    confirmed: bool
    options: list[ElementOption]


class SectionState(BaseModel):
    """One quote unit: a room, "generale", or "chat" (a project without rooms, `label` None)."""
    model_config = ConfigDict(extra="forbid")

    section_key: str
    label: str | None
    # Something the client has not confirmed yet (a measure, a proposal, an element).
    pending: bool
    measures: list[MeasureState]
    element_choices: list[ElementChoiceState]


class ConfirmationState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    sections: list[SectionState]
    # The client can still change the quote: none yet, or a draft.
    editable: bool
    # Precision of the draft's price range (0-100); None without a draft or a range.
    precision: int | None


class ConfirmationResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # The draft was recomputed from the confirmed values (no model call).
    recalculated: bool
    # Sections still missing a measure: the draft waits for them.
    blocked_sections: list[str]
    state: ConfirmationState
