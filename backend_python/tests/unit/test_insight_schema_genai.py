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
import pytest
from google.genai import _transformers as genai_transformers
from pydantic import BaseModel
from src.schemas.assembly_library import FORMULA_VARIABLES, AssemblyLibrary
from src.services import assembly_library, price_book
from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion, response_schema_for


@pytest.fixture(scope="module")
def library() -> AssemblyLibrary:
    assembly_library.reset_library_cache()
    loaded = assembly_library.load_library()
    assert loaded is not None
    return loaded


@pytest.fixture(scope="module")
def seed_skus() -> list[str]:
    return [str(item["sku"]) for item in price_book.seed_items()]


def _assert_no_additional_properties(node: object, path: str = "$") -> None:
    if isinstance(node, dict):
        for key, value in node.items():
            assert key != "additional_properties", f"found at {path}.{key}"
            _assert_no_additional_properties(value, f"{path}.{key}")
    elif isinstance(node, list):
        for i, value in enumerate(node):
            _assert_no_additional_properties(value, f"{path}[{i}]")


def _genai_properties(model: type[BaseModel]) -> dict:
    return genai_transformers.t_schema(None, model).model_dump(exclude_none=True)["properties"]


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
    _assert_no_additional_properties(schema.model_dump(exclude_none=True))


def test_qty_still_rejects_zero_and_negative():
    """The gt→ge fix must not weaken validation: qty <= 0 stays invalid."""
    import pytest
    from pydantic import ValidationError

    for bad_qty in (0, -1, 0.001):
        with pytest.raises(ValidationError):
            SKUItemSuggestion(sku="TCHR_001", qty=bad_qty, ai_reasoning="x")

    item = SKUItemSuggestion(sku="TCHR_001", qty=0.01, ai_reasoning="x")
    assert item.qty == 0.01


# ── Schema with the allowed values (Phase 140, step 1) ────────────────────────


def test_dynamic_schema_converts_to_genai_schema(library: AssemblyLibrary, seed_skus: list[str]) -> None:
    schema = genai_transformers.t_schema(None, response_schema_for(library, seed_skus))
    _assert_no_additional_properties(schema.model_dump(exclude_none=True))


def test_dynamic_schema_enumerates_packages_skus_and_measures(
    library: AssemblyLibrary, seed_skus: list[str]
) -> None:
    props = _genai_properties(response_schema_for(library, seed_skus))
    package = props["packages"]["items"]["properties"]
    assert package["assembly_id"]["enum"] == [a.id for a in library.assemblies]
    assert package["conditions"]["items"]["enum"] == library.conditions()
    assert props["element_choices"]["items"]["properties"]["element"]["enum"] == library.element_names()
    assert props["suggestions"]["items"]["properties"]["sku"]["enum"] == sorted(seed_skus)
    assert props["measures"]["items"]["properties"]["name"]["enum"] == sorted(FORMULA_VARIABLES)


def test_dynamic_schema_without_library_has_no_empty_enum(seed_skus: list[str]) -> None:
    """Gemini rejects `enum: []`: with no library the package fields stay free text."""
    props = _genai_properties(response_schema_for(None, []))
    assert "enum" not in props["packages"]["items"]["properties"]["assembly_id"]
    assert "enum" not in props["suggestions"]["items"]["properties"]["sku"]


def test_dynamic_schema_is_cached_by_library_and_price_book(
    library: AssemblyLibrary, seed_skus: list[str]
) -> None:
    first = response_schema_for(library, seed_skus)
    assert response_schema_for(library, list(reversed(seed_skus))) is first
    assert response_schema_for(library, [*seed_skus, "NUOVA-001"]) is not first


def test_dynamic_schema_parses_like_the_base_model(library: AssemblyLibrary, seed_skus: list[str]) -> None:
    """The enums constrain Gemini's decoding only: parsing stays lenient."""
    schema = response_schema_for(library, seed_skus)
    parsed = schema.model_validate({"summary": "s", "packages": [{"assembly_id": "ASM-INVENTATO"}]})
    assert isinstance(parsed, InsightAnalysis)
    assert parsed.packages[0].assembly_id == "ASM-INVENTATO"
