"""
SYD Bioedilizia — Custom evaluation rubrics for ADK AgentEvaluator.

These rubrics encode SYD's business rules as testable criteria.
Used by RubricBasedEvaluator (LLM-as-Judge) to score agent responses.

Pattern: evaluating-adk-agents skill § SELF_CORRECTION.md
"""
from google.adk.evaluation.eval_metrics import (
    EvalMetric,
    PrebuiltMetrics,
    RubricsBasedCriterion,
    JudgeModelOptions,
)
from google.adk.evaluation.eval_rubrics import Rubric, RubricContent


# ── Judge Model Config ────────────────────────────────────────────────────────

SYD_JUDGE_OPTIONS = JudgeModelOptions(
    judge_model="gemini-2.5-flash",
    num_samples=3,  # 3 samples for cost efficiency; increase for CI
)


# ── SYD Business Rule Rubrics ────────────────────────────────────────────────

NO_FURNITURE_RUBRIC = Rubric(
    rubric_id="no_furniture",
    rubric_content=RubricContent(
        text_property=(
            "The response does NOT mention furniture, appliances, or fixtures as quote line items. "
            "Prohibited terms in quote context: mobili, cucina componibile, divano, elettrodomestici, "
            "lavatrice, frigorifero, letto, armadio, tavolo, sedie. "
            "Score 1.0 if none of these appear as quote items. "
            "Score 0.5 if mentioned but only as a disclaimer ('non incluso'). "
            "Score 0.0 if any appears as a quoted/priced line item."
        )
    ),
    description="SYD Bioedilizia only quotes structural/building work, never furniture.",
    type="FINAL_RESPONSE_QUALITY",
)

ITALIAN_ONLY_RUBRIC = Rubric(
    rubric_id="italian_only",
    rubric_content=RubricContent(
        text_property=(
            "The response is entirely in Italian. "
            "Score 1.0 if the response is fully Italian. "
            "Score 0.5 if mostly Italian with minor English technical terms (e.g., 'rendering'). "
            "Score 0.0 if significant portions are in another language."
        )
    ),
    description="SYD always responds in Italian.",
    type="FINAL_RESPONSE_QUALITY",
)

HAS_MQ_RUBRIC = Rubric(
    rubric_id="has_mq",
    rubric_content=RubricContent(
        text_property=(
            "Quote line items include surface area measurements in m² (mq). "
            "Score 1.0 if area-based items (pavimento, pareti, soffitto) have mq quantities. "
            "Score 0.5 if some items have quantities but not all. "
            "Score 0.0 if no surface measurements are present."
        )
    ),
    description="Quotes must include m² for surface-based items.",
    type="FINAL_RESPONSE_QUALITY",
)

SKU_PRESENT_RUBRIC = Rubric(
    rubric_id="sku_present",
    rubric_content=RubricContent(
        text_property=(
            "Each quote line item has a recognizable SKU code or item code. "
            "Score 1.0 if all items have identifiable codes. "
            "Score 0.5 if some items have codes. "
            "Score 0.0 if no codes are present."
        )
    ),
    description="All quote items must reference Price Book SKUs.",
    type="FINAL_RESPONSE_QUALITY",
)

NO_ROUTING_IN_QUOTE_FLOW_RUBRIC = Rubric(
    rubric_id="no_routing_in_quote_flow",
    rubric_content=RubricContent(
        text_property=(
            "When the conversation already has an active quote/preventivo discussion, "
            "the triage analysis response does NOT ask 'Come vuoi procedere?' or present "
            "'1. Visualizzare / 2. Preventivo' routing options. "
            "Score 1.0 if no routing question appears. "
            "Score 0.0 if the routing question is present."
        )
    ),
    description="Triage must not re-ask routing when already in quote flow.",
    type="FINAL_RESPONSE_QUALITY",
)

INTENT_FIRST_RUBRIC = Rubric(
    rubric_id="intent_first_on_upload",
    rubric_content=RubricContent(
        text_property=(
            "When a user uploads a photo/video without specifying intent and without "
            "an active conversation context, the response asks what they want to do "
            "BEFORE performing full analysis. Must contain options like "
            "'Rendering', 'Preventivo', or numbered choices. "
            "Score 1.0 if intent question is asked first. "
            "Score 0.0 if full analysis is performed without asking intent."
        )
    ),
    description="File uploads without context must trigger intent question first.",
    type="FINAL_RESPONSE_QUALITY",
)


# ── Composite Metric Definitions ─────────────────────────────────────────────

SYD_QUOTE_QUALITY = EvalMetric(
    metric_name=PrebuiltMetrics.RUBRIC_BASED_FINAL_RESPONSE_QUALITY_V1.value,
    criterion=RubricsBasedCriterion(
        threshold=0.7,
        judge_model_options=SYD_JUDGE_OPTIONS,
        rubrics=[
            NO_FURNITURE_RUBRIC,
            ITALIAN_ONLY_RUBRIC,
            HAS_MQ_RUBRIC,
            SKU_PRESENT_RUBRIC,
        ],
    ),
)

SYD_TRIAGE_QUALITY = EvalMetric(
    metric_name=PrebuiltMetrics.RUBRIC_BASED_FINAL_RESPONSE_QUALITY_V1.value,
    criterion=RubricsBasedCriterion(
        threshold=0.8,
        judge_model_options=SYD_JUDGE_OPTIONS,
        rubrics=[
            ITALIAN_ONLY_RUBRIC,
            NO_ROUTING_IN_QUOTE_FLOW_RUBRIC,
        ],
    ),
)

SYD_INTENT_FIRST_QUALITY = EvalMetric(
    metric_name=PrebuiltMetrics.RUBRIC_BASED_FINAL_RESPONSE_QUALITY_V1.value,
    criterion=RubricsBasedCriterion(
        threshold=0.8,
        judge_model_options=SYD_JUDGE_OPTIONS,
        rubrics=[
            INTENT_FIRST_RUBRIC,
            ITALIAN_ONLY_RUBRIC,
        ],
    ),
)
