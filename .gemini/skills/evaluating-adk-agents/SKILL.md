---
name: evaluating-adk-agents
description: Evaluate Google ADK multi-agent systems using native AgentEvaluator, LlmAsJudge, and RubricBasedEvaluator. Implements self-correction loops that detect prompt failures and propose targeted fixes. Use when testing ADK agents, measuring response quality, catching hallucinations, validating tool trajectories, or closing the feedback loop between eval results and prompt updates.
---

# ADK Agent Evaluation & Self-Correction

Covers: running ADK native evals, writing SYD-specific rubrics, and the self-correction loop (eval → diagnose failure → update prompt).

## ADK Evaluation Stack (already installed)

```
google.adk.evaluation/
├── AgentEvaluator          # Test harness — runs agent + applies metrics
├── TrajectoryEvaluator     # Tool call sequence validation
├── ResponseEvaluator       # ROUGE / Vertex AI coherence [1-5]
├── LlmAsJudge              # Base class for LLM-powered scoring
├── RubricBasedEvaluator    # Multi-criterion scoring with rationale
├── HallucinationEvaluatorV1# Sentence-level fact check
└── SafetyEvaluatorV1       # Vertex AI safety [0-1]
```

## Quick Start — Run Full Eval Suite

```python
from google.adk.evaluation import AgentEvaluator, EvalConfig

await AgentEvaluator.evaluate(
    agent_module="src.adk.agents",          # module exposing syd_orchestrator
    eval_dataset_file_path_or_dir="tests/evals/",  # *.test.json files
    num_runs=2,
)
```

`tests/evals/test_config.json` (in same folder as test files):
```json
{
  "criteria": {
    "tool_trajectory_avg_score": 1.0,
    "response_evaluation_score": 3.5,
    "hallucinations_v1": { "threshold": 0.8, "judgeModelOptions": { "judgeModel": "gemini-2.5-flash" } }
  }
}
```

## SYD-Specific Rubrics

For domain rules that generic metrics can't check (e.g., "never includes furniture in quotes"):

```python
# tests/evals/syd_rubrics.py
from google.adk.evaluation.rubric_based_evaluator import RubricBasedEvaluator
from google.adk.evaluation.eval_metrics import EvalMetric, PrebuiltMetrics

SYD_QUOTE_RUBRICS = EvalMetric(
    metric_name=PrebuiltMetrics.RUBRIC_BASED_FINAL_RESPONSE_QUALITY_V1,
    threshold=0.7,
    rubrics=[
        {"rubric_id": "no_furniture", "rubric_content": "Response does NOT mention furniture, appliances, or fixtures (mobili, cucine, divani, elettrodomestici). Score 1.0 if absent, 0.0 if present."},
        {"rubric_id": "italian_only",  "rubric_content": "Response is entirely in Italian. Score 1.0 if Italian, 0.0 if mixed or other language."},
        {"rubric_id": "has_mq",        "rubric_content": "Quote items include surface area in m² (mq). Score 1.0 if present, 0.5 if estimated, 0.0 if missing."},
        {"rubric_id": "sku_present",   "rubric_content": "Each line item has a SKU code. Score 1.0 if all items have SKUs, partial credit otherwise."},
    ]
)
```

**See [EVAL_SET.md](EVAL_SET.md)** for test case JSON format and SYD scenario library (bagno, rendering, triage).

**See [SELF_CORRECTION.md](SELF_CORRECTION.md)** for the loop that converts failing rubrics into prompt patches.

## Metric Selection Guide

| Goal | Metric |
|---|---|
| Verify `suggest_quote_items` was called | `tool_trajectory_avg_score` |
| Check response coherence | `response_evaluation_score` |
| Detect invented SKUs or prices | `hallucinations_v1` |
| Enforce SYD business rules | `rubric_based_final_response_quality_v1` (custom rubrics) |
| Safety / harmful content | `safety_v1` |

## Running Evals in CI

```bash
cd backend_python
uv run python -m pytest tests/evals/ -v --tb=short
```

Or standalone (no pytest):
```bash
uv run python tests/evals/run_evals.py
```
