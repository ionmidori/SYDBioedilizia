"""
Regression: InsightAnalysis must be convertible to a genai Schema.

Bug (found in production E2E, 22 Lug 2026): SKUItemSuggestion.qty used
Field(gt=0), which emits `exclusiveMinimum` in the JSON schema. The installed
google-genai Schema model forbids that keyword (extra_forbidden), so EVERY
suggest_quote_items call crashed before reaching Gemini:
"Project analysis failed: 1 validation error for Schema
 properties.suggestions.items.properties.qty.exclusiveMinimum".
No draft quote was ever saved → nothing to submit → no admin email.

The test converts the model through the SAME transformer the SDK uses for
response_schema, so any future unsupported-keyword regression fails here.
"""
from google.genai import _transformers as genai_transformers
from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion


def test_insight_analysis_converts_to_genai_schema():
    schema = genai_transformers.t_schema(None, InsightAnalysis)  # raises on unsupported keywords
    assert schema is not None


def test_qty_still_rejects_zero_and_negative():
    """The gt→ge fix must not weaken validation: qty <= 0 stays invalid."""
    import pytest
    from pydantic import ValidationError

    for bad_qty in (0, -1, 0.001):
        with pytest.raises(ValidationError):
            SKUItemSuggestion(sku="TCHR_001", qty=bad_qty, ai_reasoning="x")

    item = SKUItemSuggestion(sku="TCHR_001", qty=0.01, ai_reasoning="x")
    assert item.qty == 0.01
