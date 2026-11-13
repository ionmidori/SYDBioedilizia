"""Price range of a draft (Phase 140, step 3): the policy that sets it and the result.

The policy is data, not code (`src/data/price_range_policy.json`): how uncertain a
quote line is, by where its quantity came from. Its values are to be confirmed by
the SYD technician, like the package coefficients.
"""
from decimal import Decimal
from typing import Annotated, Self, get_args

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.core.money import Money
from src.schemas.intervention_spec import StoredMeasureSource

# A share of a line amount: 0.05 = ±5 %.
Fraction = Annotated[Decimal, Field(ge=0, le=1)]


class PriceRangePolicy(BaseModel):
    """Uncertainty of a line by the source of its quantity, and how manual work widens the range."""
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: str = Field(min_length=1)
    by_source: dict[StoredMeasureSource, Fraction]
    no_measure: Fraction = Field(description="A line whose formula uses no measure (pieces, flat items)")
    model_qty: Fraction = Field(description="An extra line: the quantity was written by the model")
    manual_work_high: Fraction = Field(description="Upper bound widening for each work quoted by hand")
    manual_work_cap: Fraction = Field(description="Upper bound widening at most, whatever the manual work")
    precision_step: int = Field(ge=1, le=50, description="The precision shown is a multiple of this")

    @model_validator(mode="after")
    def _every_source(self) -> Self:
        missing = set(get_args(StoredMeasureSource)) - set(self.by_source)
        if missing:
            raise ValueError(f"by_source lacks {sorted(missing)}")
        return self


class PriceEstimate(BaseModel):
    """The range of a draft, VAT included, and its precision (0-100). The team reads
    the amounts; the client is shown the precision only."""
    model_config = ConfigDict(extra="forbid")

    low: Money
    high: Money
    precision: int | None = Field(default=None, ge=0, le=100)
    policy_version: str


class PricePrecision(BaseModel):
    """What the client reads of the range before approval: its precision, no amount."""
    model_config = ConfigDict(extra="forbid")

    precision: int | None = Field(default=None, ge=0, le=100)
