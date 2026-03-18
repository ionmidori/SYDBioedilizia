---
name: evaluating-llms
description: Evaluate ADK agent responses using Google ADK AgentEvaluator, RubricBasedEvaluator, and LLM-as-Judge patterns. Use when writing eval rubrics, running evaluation suites, or validating agent behavior against business rules.
---

# Evaluating LLMs (ADK)

SYD uses **Google ADK AgentEvaluator** for all agent evaluation — not LangSmith, RAGAS, or DeepEval.

## SYD Evaluation Stack

| Component | File | Purpose |
|-----------|------|---------|
| Rubrics | `tests/evals/syd_rubrics.py` | Business-rule rubrics (Rubric objects) |
| Runner | `tests/evals/run_evals.py` | CLI runner: `uv run python tests/evals/run_evals.py` |
| Test data | `tests/evals/*.test.json` | Input/expected pairs per agent |

## Writing Rubrics

Each rubric encodes one testable business rule:

```python
from google.adk.evaluation.eval_rubrics import Rubric, RubricContent

NO_FURNITURE_RUBRIC = Rubric(
    rubric_id="no_furniture",
    rubric_content=RubricContent(
        text_property=(
            "The response does NOT mention furniture as quote line items. "
            "Score 1.0 if none appear. Score 0.0 if any appears as a priced item."
        )
    ),
    description="SYD only quotes structural/building work, never furniture.",
    type="FINAL_RESPONSE_QUALITY",
)
```

**SYD rubrics in production**: `no_furniture`, `italian_only`, `has_mq`, `sku_present`, `no_routing_in_quote_flow`, `intent_first_on_upload`.

## Composing Metrics

Group rubrics into composite metrics with a threshold:

```python
from google.adk.evaluation.eval_metrics import EvalMetric, PrebuiltMetrics, RubricsBasedCriterion, JudgeModelOptions

SYD_QUOTE_QUALITY = EvalMetric(
    metric_name=PrebuiltMetrics.RUBRIC_BASED_FINAL_RESPONSE_QUALITY_V1.value,
    criterion=RubricsBasedCriterion(
        threshold=0.7,
        judge_model_options=JudgeModelOptions(
            judge_model="gemini-3.1-flash-lite-preview",
            num_samples=3,
        ),
        rubrics=[NO_FURNITURE_RUBRIC, ITALIAN_ONLY_RUBRIC, HAS_MQ_RUBRIC],
    ),
)
```

## Running Evaluations

```bash
# All eval sets
uv run python tests/evals/run_evals.py

# Specific test file
uv run python tests/evals/run_evals.py --file quote_flow.test.json

# Specific sub-agent
uv run python tests/evals/run_evals.py --agent quote
```

## Self-Correction Loop

When an eval fails:

1. **Diagnose**: Which rubric scored < threshold?
2. **Patch prompt**: Add explicit instruction to the ADK agent's `instruction` field
3. **Re-run**: Verify the rubric now passes
4. **Commit**: Rubric + prompt change together (atomic)

## Test Data Format (`.test.json`)

```json
[
  {
    "input": "Vorrei un preventivo per il bagno, 6mq",
    "expected": "Contains m² quantities and no furniture items",
    "agent_name": "quote"
  }
]
```

## Rules

- Judge model: `gemini-3.1-flash-lite-preview` (cost-efficient, 3 samples)
- All rubrics score 0.0–1.0 (never boolean)
- Rubric text must be self-contained — the judge model has no other context
- Threshold per composite metric: 0.7 for quote quality, 0.8 for triage
