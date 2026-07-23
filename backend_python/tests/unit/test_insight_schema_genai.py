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


def test_schema_has_no_additional_properties_keyword():
    """
    Regression (found in production E2E #2, 23 Lug 2026): model_config
    {"extra": "forbid"} emits `additionalProperties: false` in the JSON schema.
    t_schema accepts it (Schema has an additional_properties field), but the
    GEMINI_API backend rejects the serialized snake_case key with
    400 INVALID_ARGUMENT: 'Unknown name "additional_properties"' — at the
    schema root (InsightAnalysis) and at suggestions.items (SKUItemSuggestion).
    Every suggest_quote_items call failed → no draft → no submit → no email.
    """
    schema = genai_transformers.t_schema(None, InsightAnalysis)
    dumped = schema.model_dump(exclude_none=True)

    def assert_no_additional_properties(node: object, path: str = "$") -> None:
        if isinstance(node, dict):
            for key, value in node.items():
                assert key != "additional_properties", f"found at {path}.{key}"
                assert_no_additional_properties(value, f"{path}.{key}")
        elif isinstance(node, list):
            for i, value in enumerate(node):
                assert_no_additional_properties(value, f"{path}[{i}]")

    assert_no_additional_properties(dumped)


def test_qty_still_rejects_zero_and_negative():
    """The gt→ge fix must not weaken validation: qty <= 0 stays invalid."""
    import pytest
    from pydantic import ValidationError

    for bad_qty in (0, -1, 0.001):
        with pytest.raises(ValidationError):
            SKUItemSuggestion(sku="TCHR_001", qty=bad_qty, ai_reasoning="x")

    item = SKUItemSuggestion(sku="TCHR_001", qty=0.01, ai_reasoning="x")
    assert item.qty == 0.01
