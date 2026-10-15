# Backend test suite

The backend suite covers the FastAPI app, the ADK tools, the services and the
Firestore access layer with about 1,200 tests. It runs offline: Firebase,
Vertex AI, Pinecone and email providers are mocked, so no credentials are
needed. Tests that need a live API are marked `integration` and are skipped by
default.

## Run the tests

Run the commands from `backend_python/`. Install the test tools first:

```bash
uv sync --extra dev
```

Then pick what to run:

```bash
uv run pytest                                  # everything except integration tests
uv run pytest tests/unit/test_quota.py         # one file
uv run pytest tests/unit/test_quota.py -k bypass   # tests matching a name
uv run pytest -m integration                   # live API tests (need credentials)
uv run pytest --cov=src --cov-report=term      # with coverage
```

`pyproject.toml` sets `asyncio_mode = "auto"`, so `async def` tests need no
decorator, and `addopts = "-m 'not integration'"`.

## Layout

```text
tests/
├── conftest.py          # Shared fixtures: Firebase, Gemini and settings mocks
├── unit/                # Isolated tests, one module per area (about 100 files)
├── integration/         # Multi-component flows (some need a live API)
├── evals/               # ADK agent evaluations (see evals/README.md)
├── test_listino_tools.py, test_rag_service.py
└── benchmark_adk.py, load_test_adk.py, repro_issues.py   # Manual scripts, not tests
```

`tests/unit/firestore_fakes.py` provides an in-memory fake Firestore
(`FakeDb`, `FakeTransaction`) used by the outbox, quote and project tests.

## Contract tests worth knowing

These tests protect rules that are easy to break by accident:

| Test | What it pins |
| :--- | :--- |
| `test_middleware_order.py` | Order of the ASGI middleware stack in `main.py` |
| `test_api_error_contract.py` | Every response has `X-Request-ID` and the error envelope; CORS headers on App Check 403 and catcher 500 responses |
| `test_model_registry.py` | No `gemini-` literal outside `src/core/config.py` |
| `test_build_context.py` | `.gcloudignore` matches `.dockerignore`; every file in `src/data` is tracked by git |
| `test_no_debug_routes.py`, `test_n8n_decommissioned.py`, `test_no_legacy_lead_path.py` | Removed routes and integrations stay removed |
| `test_adk_tools_trusted_identity.py` | Tools trust the user and session from `tool_context`, never from model arguments |
| `evals/test_eval_infrastructure.py` | Eval files load with the installed `google-adk` |

## Writing tests

1. Follow Arrange, Act, Assert, and give each test a name that states the
   behavior, such as `test_permanent_failure_dead_letters_and_tells_the_admin`.
2. Mock every external service (Gemini, Firebase, Storage, Pinecone). Tests must
   not touch real Firebase.
3. Keep tests independent: no shared state between tests.
4. Write a new repeatable check as a test here, not as a script in `scripts/`.

Example:

```python
async def test_retry_emits_no_alert_event(db, caplog):
    caplog.set_level(logging.INFO, logger=outbox.__name__)
    _seed(db)
    queued = await _enqueue(db)

    outcome = await outbox.dispatch_one(db, queued.delivery_id, FailingProvider(), NOW)

    assert outcome == "retry"
    assert _dead_letter_records(caplog) == []
```

## Continuous integration

The `Backend Python Tests` workflow (`.github/workflows/backend-tests.yml`)
checks that `uv.lock` is in sync with `pyproject.toml`, then runs ruff,
pyright, `pip-audit` and the suite with a coverage gate on every pull request
that touches the backend. A separate job builds the Docker image. Run the same
checks before you push:

```bash
uv run ruff check src/ main.py tests/
uv run pyright
uv run pytest
```

## Troubleshooting

- **"Firebase app not initialized"**: the test is bypassing the mocks in
  `conftest.py`. Use the shared fixtures; never initialize the real SDK.
- **Async test is skipped or fails to collect**: check that `pytest-asyncio` is
  installed (`uv sync --extra dev`).
- **`test_runtime_data_is_versioned` fails**: a file in `src/data/` isn't
  tracked by git. Commit it, or remove it if it's a local leftover.
- **`uv run pytest` reports "program not found"**: `uv sync` without
  `--extra dev` removes pytest from the environment. Run
  `uv sync --extra dev` again.
