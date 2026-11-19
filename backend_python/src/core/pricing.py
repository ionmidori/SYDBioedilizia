"""Vertex AI Gemini token pricing estimates (USD per 1M tokens).

Used purely for telemetry and KPI dashboards — never for billing or invoices.
Vertex AI `prompt_token_count` includes `cached_content_token_count`, so
uncached prompt tokens are `max(0, prompt - cached)`. Thinking tokens
(`thoughts_token_count`) are billed at the output token rate.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ModelTokenRates:
    input_per_1m: float
    cached_input_per_1m: float
    output_per_1m: float


# Match by model version/tier (more specific first) without hardcoding `gemini-*`
# literals (guarded by tests/unit/test_model_registry.py).
# Rates reflect Vertex AI `eu` regional pricing verified 2026-11-19:
# - 3.5-flash-lite: $0.33 / $0.03 cached / $2.75 output
# - 3.8-flash: $0.75 / $0.075 cached / $3.75 output (promo through 2026-12-31)
# - 4-hydrogen: $1.65 / $0.0825 cached / $8.25 output
_TIER_RATES: tuple[tuple[str, ModelTokenRates], ...] = (
    ("3.5-flash-lite", ModelTokenRates(0.33, 0.03, 2.75)),
    ("flash-lite", ModelTokenRates(0.33, 0.03, 2.75)),
    ("3.8-flash", ModelTokenRates(0.75, 0.075, 3.75)),
    ("4-hydrogen", ModelTokenRates(1.65, 0.0825, 8.25)),
    ("flash", ModelTokenRates(0.75, 0.075, 3.75)),
    ("pro", ModelTokenRates(1.25, 0.125, 10.00)),
)
_DEFAULT_RATES = ModelTokenRates(0.75, 0.075, 3.75)


def _rates_for_model(model: str) -> ModelTokenRates:
    # Strip full Vertex resource paths (e.g. projects/.../models/...) before tier match.
    normalized = model.lower().strip(" /").rsplit("/", 1)[-1]
    for tier, rates in _TIER_RATES:
        if tier in normalized:
            return rates
    return _DEFAULT_RATES


def estimate_llm_cost_usd(
    model: str,
    *,
    prompt_tokens: int | None,
    cached_tokens: int | None,
    thoughts_tokens: int | None,
    output_tokens: int | None,
) -> float:
    """Return estimated USD cost for one Gemini call, rounded to 6 decimals."""
    prompt = max(0, prompt_tokens or 0)
    cached = min(prompt, max(0, cached_tokens or 0))
    uncached_prompt = prompt - cached
    billed_output = max(0, output_tokens or 0) + max(0, thoughts_tokens or 0)
    if uncached_prompt == 0 and cached == 0 and billed_output == 0:
        return 0.0

    rates = _rates_for_model(model)
    usd = (
        uncached_prompt * rates.input_per_1m
        + cached * rates.cached_input_per_1m
        + billed_output * rates.output_per_1m
    ) / 1_000_000.0
    return round(usd, 6)
