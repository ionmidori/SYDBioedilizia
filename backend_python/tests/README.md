# Backend Test Suite

Comprehensive test coverage for the Python backend, organized by unit, integration, and offline evaluation tests.

## Quick Start

### Install Test Dependencies
```bash
uv sync --extra dev
```

### Run All Tests
```bash
uv run pytest
```

### Run Specific Test Categories      
```bash
# Unit tests only
uv run pytest tests/unit/

# Integration tests only
uv run pytest tests/integration/      

# Offline Evaluation tests
uv run pytest tests/evals/

# Specific module
uv run pytest tests/unit/test_quota.py

# Single test
uv run pytest tests/unit/test_quota.py::TestQuotaCheckDevelopment::test_development_env_bypasses_quota
```

## Test Coverage

### Generate Coverage Report
```bash
# Run tests with coverage
uv run pytest --cov=src --cov-report=html

# Open report
start htmlcov/index.html  # Windows   
```

### Current Coverage
- **Quota System**: Full coverage (check, increment, dev bypass)
- **Architect Vision**: JSON parsing, fallback, MIME handling
- **Render Generation**: T2I, I2I, error handling, fallback
- **ADK Orchestrator**: Session handling, stream recovery, fallback mechanisms
- **Batch Processing**: Multi-project aggregation, rules validation, and routing (Phase 74)
- **Offline Evals**: Built-in evaluation loop for ADK quality (`tests/evals`)

## Test Structure

```
tests/
├── conftest.py              # Shared fixtures (mocks for Firebase, Gemini, etc.)
├── unit/                    # Unit tests (isolated functions)
│   ├── test_quota.py        # Quota management
│   ├── test_architect.py    # Vision/Architect module
│   └── test_adk_*.py        # ADK Orchestrator internals
├── integration/             # Integration tests (multi-component flows)    
│   └── test_tools.py        # Full render generation pipeline
└── evals/                   # ADK Offline Evaluation Suite (Phase 70)
    ├── syd_rubrics.py       # Custom evaluation rubrics (e.g. no_furniture, has_mq)
    └── run_evals.py         # Standalone evaluator for iterative prompt tuning
```

## Best Practices

### Writing Tests
1. **AAA Pattern**: Arrange → Act → Assert
2. **Descriptive Names**: `test_when_X_then_Y`
3. **Docstrings**: Use GIVEN/WHEN/THEN format
4. **Mocking**: Mock external APIs (Gemini, Firebase, Storage)
5. **Isolation**: Each test is independent

### Example
```python
@pytest.mark.asyncio
async def test_quota_bypass_in_development(mock_env_development):
    """GIVEN development environment variable set
    WHEN checking quota for any tool  
    THEN should bypass limits and allow unlimited usage
    """
    # Arrange
    user_id = "test-user"

    # Act
    allowed, remaining, reset_at = check_quota(user_id, "generate_render")  

    # Assert
    assert allowed is True
    assert remaining == 9999
```

## ADK Evaluations (Self-Correction Loop)
The `tests/evals` directory contains live ADK evaluations for validating agent quality:

### Infrastructure (Phase 80d)
- **Rubrics** (`syd_rubrics.py`): Custom LLM-as-Judge evaluators (NO_FURNITURE, ITALIAN_ONLY, HAS_MQ, SKU_PRESENT, NO_ROUTING_IN_QUOTE_FLOW, INTENT_FIRST).
- **Test Cases** (`.test.json`): 5 eval cases across 3 flows:
  - `quote_flow.test.json` — 2 cases (bathroom + large room quotes)
  - `triage_flow.test.json` — 2 cases (intent routing)
  - `design_flow.test.json` — 1 case (rendering)
- **Config** (`test_config.json`): Tool trajectory matching (IN_ORDER) + response match criteria.
- **Results** (`results/`): Live eval outputs stored as timestamped JSON (not tracked in git).

### Running Live Evaluations
**Requires**: `GOOGLE_API_KEY` in `.env` (calls live Gemini API + LLM-as-Judge).

```bash
# All test flows (quote, triage, design)
npm run eval:run

# Individual flows
npm run eval:run:quote      # Quote agent validation
npm run eval:run:triage     # Triage agent validation
npm run eval:run:design     # Design agent validation

# Advanced usage (from backend_python/)
uv run python tests/evals/run_evals.py \
  --file quote_flow.test.json \
  --agent quote \
  --runs 3 \
  --output results/
```

### Evaluation Workflow
1. Define behavior expectations in `syd_rubrics.py` (LLM-as-Judge prompts).
2. Provide user/agent conversation test cases in `.test.json` files.
3. Run `npm run eval:run` to launch `AgentEvaluator.evaluate()` (calls live Gemini API).
4. Results saved to `results/eval_{timestamp}_{flow}.json` for analysis.
5. Use rubric scores and tool trajectory metrics to drive prompt tuning.

## Continuous Integration

Add to `.github/workflows/test.yml`:  
```yaml
- name: Run tests
  run: uv run pytest --cov=src --cov-report=xml
```

## Troubleshooting

### Tests fail with "Firebase app not initialized"
→ Check `conftest.py` mocks are being used. Tests should NOT touch real Firebase.

### Async tests fail
→ Ensure `pytest-asyncio` is installed and `@pytest.mark.asyncio` is used.  

### Coverage too low
→ Add tests for uncovered edge cases (error handling, fallbacks).

