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
The `tests/evals` directory contains offline evaluations for tuning ADK system prompts:
1. Define behavior expectations in `syd_rubrics.py`.
2. Provide test cases in `.test.json` files.
3. Run `python tests/evals/run_evals.py` to evaluate responses against rubrics.

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

