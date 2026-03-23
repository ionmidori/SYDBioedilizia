# 🧪 ADK Live Evaluation Suite

Enterprise-grade evaluation framework for validating SYD AI agent behavior using Google ADK's native `AgentEvaluator` with LLM-as-Judge rubrics.

---

## 📋 Quick Start

### Prerequisites
- `GOOGLE_API_KEY` set in `.env` (eval runner calls live Gemini API)
- Python 3.12+ with `uv`
- All dependencies: `uv sync`

### Run Evaluations
```bash
# From repo root
npm run eval:run                    # All flows (quote, triage, design)

# Or from backend_python/
cd backend_python
uv run python tests/evals/run_evals.py --output results/
```

**Output**: Timestamped JSON files in `results/eval_{timestamp}_{flow}.json` with scores and metadata.

---

## 🏗️ Architecture

### Test Files (Eval Cases)

```
quote_flow.test.json     → 2 test cases (bagno 6mq, soggiorno 28mq)
triage_flow.test.json    → 2 test cases (routing decisions)
design_flow.test.json    → 1 test case (rendering response)
```

Each `.test.json` follows ADK EvalSet format:
```json
{
  "evalSetId": "syd_quote_flow_v1",
  "name": "SYD Quote Flow Scenarios",
  "evalCases": [
    {
      "evalId": "unique_case_id",
      "conversation": [
        {
          "invocationId": "unique_invocation",
          "userContent": { "parts": [{"text": "user message"}], "role": "user" },
          "finalResponse": { "parts": [{"text": "expected response"}], "role": "model" },
          "intermediateData": {
            "toolUses": [
              {"name": "suggest_quote_items", "args": {}, "id": "call_001"}
            ]
          }
        }
      ]
    }
  ]
}
```

### Rubrics (Custom Evaluators)

**File**: `syd_rubrics.py`

Each rubric scores a specific SYD business rule using LLM-as-Judge:

| Rubric | Validates | Score |
|--------|-----------|-------|
| `NO_FURNITURE_RUBRIC` | Quotes never include furniture as line items | 1.0 = pass, 0.0 = fail |
| `ITALIAN_ONLY_RUBRIC` | All responses in Italian | 1.0 = full Italian, 0.5 = mixed, 0.0 = other |
| `HAS_MQ_RUBRIC` | Quote items include m² quantities | 1.0 = all items, 0.5 = some, 0.0 = none |
| `SKU_PRESENT_RUBRIC` | All items reference Price Book SKUs | 1.0 = all, 0.5 = some, 0.0 = none |
| `NO_ROUTING_IN_QUOTE_FLOW_RUBRIC` | Triage doesn't re-ask routing when in quote context | 1.0 = pass, 0.0 = fail |
| `INTENT_FIRST_RUBRIC` | File uploads without context trigger intent question first | 1.0 = pass, 0.0 = fail |

**Composite Metrics** (combine multiple rubrics):
- `SYD_QUOTE_QUALITY` — NO_FURNITURE + ITALIAN_ONLY + HAS_MQ + SKU_PRESENT (threshold: 0.7)
- `SYD_TRIAGE_QUALITY` — ITALIAN_ONLY + NO_ROUTING_IN_QUOTE_FLOW (threshold: 0.8)
- `SYD_INTENT_FIRST_QUALITY` — INTENT_FIRST + ITALIAN_ONLY (threshold: 0.8)

**Judge Model**: `gemini-3.1-flash-lite-preview` (cost-efficient)

### Test Configuration

**File**: `test_config.json`

```json
{
  "criteria": {
    "tool_trajectory_avg_score": {
      "threshold": 1.0,
      "matchType": "IN_ORDER"
    },
    "response_match_score": 0.3
  }
}
```

- **`tool_trajectory_avg_score`**: Validates tool call sequence (IN_ORDER = tools must appear in expected sequence, extra tools allowed)
- **`response_match_score`**: Semantic similarity threshold for agent response vs expected (0.3 = permissive)

### Evaluation Runner

**File**: `run_evals.py`

Standalone orchestrator calling `AgentEvaluator.evaluate()` with:
- **Agent Module**: `src.adk.agents` (root_agent + triage/design/quote sub-agents)
- **Eval Dataset**: test.json files or directory
- **Config**: Auto-loaded from `test_config.json` in eval directory
- **Output**: Optional JSON persistence (`--output results/`)

**CLI Options**:
```bash
uv run python tests/evals/run_evals.py \
  [--file quote_flow.test.json]        # Specific test file (default: all)
  [--agent quote]                       # Sub-agent name (default: root)
  [--runs 3]                            # Iterations per case (default: 1)
  [--output results/]                   # Save JSON results (default: console only)
```

**Output Format**:
```json
{
  "meta": {
    "run_at": "2026-03-20T10:30:45.123Z",
    "agent_module": "src.adk.agents",
    "file_filter": "quote_flow.test.json",
    "agent_name": "quote",
    "num_runs": 1
  },
  "results": {
    "evalSetId": "syd_quote_flow_v1",
    "evalCaseResults": [
      {
        "evalId": "bagno_preventivo_no_furniture",
        "invocationEvalResults": [...],
        "score": 0.85,
        "passedCriteria": ["no_furniture", "italian_only", "has_mq"],
        "failedCriteria": ["sku_present"]
      }
    ]
  }
}
```

---

## 🚀 Usage Patterns

### 1. Full Validation (All Flows)
```bash
npm run eval:run
```
Evaluates 5 test cases across syd_orchestrator, triage, design, quote agents.

### 2. Single-Flow Testing
```bash
npm run eval:run:quote
```
Tests only `quote_flow.test.json` with quote_agent.

### 3. Multi-Run Confidence Intervals
```bash
cd backend_python
uv run python tests/evals/run_evals.py --runs 5 --output results/
```
Runs each case 5 times → compute mean score + variance.

### 4. Sub-Agent Focused Evaluation
```bash
uv run python tests/evals/run_evals.py \
  --file triage_flow.test.json \
  --agent triage \
  --output results/
```
Isolates triage_agent performance.

---

## 📊 Interpreting Results

**Score Breakdown**:
- **1.0** = Perfect (all rubrics pass, tool trajectory exact, response matches expected)
- **0.7–0.99** = Good (passes threshold, minor deviations)
- **0.5–0.69** = Marginal (close to threshold, needs refinement)
- **<0.5** = Fail (below acceptance criteria)

**Common Failure Modes**:
1. **Furniture mentioned** → NO_FURNITURE_RUBRIC fails → refine quote system prompt
2. **English terms** → ITALIAN_ONLY_RUBRIC fails → add IT translation rules
3. **Missing m²** → HAS_MQ_RUBRIC fails → ensure room area captured in vision analysis
4. **Wrong tool called** → tool_trajectory_avg_score fails → check tool routing logic
5. **Extra routing question** → NO_ROUTING_IN_QUOTE_FLOW_RUBRIC fails → fix triage state tracking

---

## 🔧 Customization

### Add a New Rubric
1. Define in `syd_rubrics.py`:
```python
CUSTOM_RUBRIC = Rubric(
    rubric_id="custom_check",
    rubric_content=RubricContent(
        text_property="The response does X. Score 1.0 if X occurs, 0.0 otherwise."
    ),
    description="Custom validation rule",
    type="FINAL_RESPONSE_QUALITY",
)
```

2. Add to composite metric:
```python
SYD_CUSTOM_QUALITY = EvalMetric(
    metric_name=PrebuiltMetrics.RUBRIC_BASED_FINAL_RESPONSE_QUALITY_V1.value,
    criterion=RubricsBasedCriterion(
        threshold=0.8,
        judge_model_options=SYD_JUDGE_OPTIONS,
        rubrics=[CUSTOM_RUBRIC, ITALIAN_ONLY_RUBRIC],
    ),
)
```

### Add a Test Case
1. Create `.test.json` in this directory with EvalSet format
2. Run: `npm run eval:run --file your_flow.test.json`

### Adjust Thresholds
Edit `test_config.json`:
```json
{
  "criteria": {
    "tool_trajectory_avg_score": 0.8,
    "response_match_score": 0.5
  }
}
```

---

## 🔐 Security & Cost Considerations

**API Costs**:
- Each case calls Gemini API once (user input → agent response)
- Plus 1 LLM-as-Judge call per rubric per case
- ~5 cases × 3 rubrics = 15 judge calls per full run
- **Estimated**: $0.02–0.05 USD per full eval run (Flash Lite pricing)

**Rate Limits**:
- Gemini: 10 RPM (Tier 1) → eval runner respects this via ADK backoff
- LLM-as-Judge: 100 RPM (typically sufficient for evals)

**Env Var**:
- `GOOGLE_API_KEY` must be set (no fallback to GEMINI_API_KEY)
- Validation fails fast with clear error if missing

---

## 📚 References

- [Google ADK AgentEvaluator](https://cloud.google.com/vertex-ai/docs/agent-builder/evaluate)
- [ADK Rubric-Based Evaluation](https://cloud.google.com/vertex-ai/docs/agent-builder/evaluate#rubric_based)
- [EvalSet Format](https://cloud.google.com/vertex-ai/docs/agent-builder/evaluate#evalset_format)
- [SYD Rubrics Pattern](../../.gemini/skills/evaluating-adk-agents/SKILL.md)

---

**Updated**: March 22, 2026 — Phase 81e (v4.2.1)
