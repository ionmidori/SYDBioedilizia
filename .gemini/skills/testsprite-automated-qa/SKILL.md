---
name: testsprite-automated-qa
description: Generates automated E2E and API test suites using TestSprite MCP, aligned with 3-Tier architecture and Google ADK orchestration. Use when generating tests, validating API contracts, or auditing test coverage.
---

# TestSprite Automated QA

## Workflow

```
Task Progress:
- [ ] Step 1: Provide PROJECT_CONTEXT_SUMMARY.md to TestSprite
- [ ] Step 2: Run health check (`/health`)
- [ ] Step 3: Generate tests (`npx testsprite generate --path ./api`)
- [ ] Step 4: Fix API prefix alignment (see below)
- [ ] Step 5: Run tests via MCP `run_tests`
- [ ] Step 6: Analyze `testsprite-mcp-test-report.md` for drift
```

## Critical: API Prefix Alignment

TestSprite defaults to flat paths. ALL backend endpoints require prefix:
- **Wrong**: `[GET] /projects`
- **Correct**: `[GET] /api/projects`

## Testing the ADK Orchestrator

The `/chat/stream` SSE endpoint requires a distinct approach:
- **Streaming**: Verify SSE events (tool calls, text chunks)
- **Session recovery**: Test InMemorySessionService restart (history re-injection)
- **Tool invocation**: Verify `suggest_quote_items`, `generate_render` parameters

## Validation Rules

- Payloads must match Pydantic V2 models in `src/schemas/`
- Test 401/403 with missing/invalid Bearer tokens
- Account for slowapi rate limiters on batch and quote endpoints
- Store test media assets in `backend_python/tests/test_resources/`
