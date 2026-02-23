---
name: testsprite-automated-qa
description: Master automated E2E and API testing using TestSprite MCP. Covers API prefix alignment, LangGraph orchestration testing, and test report analysis.
---

# TestSprite Automated QA Skill

Build robust automated test suites that align with the 3-Tier architecture and LangGraph orchestration.

## Core Integration Patterns

### 1. API Prefix Alignment
TestSprite generators may default to flat REST paths. ALWAYS ensure the `/api/` prefix is included for all backend endpoints.
- **Fail**: `[GET] /projects`
- **Pass**: `[GET] /api/projects`

### 2. Testing the Orchestrator (LangGraph)
Since most logic is behind the `/chat/stream` endpoint, testing requires a distinct approach:
- **Streaming Validation**: Use tools to verify that the stream emits the expected `events` (e.g., `on_chat_model_stream`, `on_tool_start`).
- **State Checkpoints**: Verify that Firestore checkpointers (e.g., `FirestoreSaver`) correctly save state mid-flow using the `project_id`.

### 3. Test Asset Management
For functional tests requiring media (images, PDFs):
- Store mock assets in `backend_python/tests/test_resources/`.
- Ensure TestSprite has access to these paths for multi-modal analysis tests.

### 4. MCP Workflow
Use TestSprite MCP tools to:
- **Generate Tests**: `npx testsprite generate --path ./api`
- **Run Tests**: Use the MCP tool `run_tests` to execute suites locally.
- **Analyze Reports**: Check `testsprite-mcp-test-report.md` to identify architectural drifts (e.g., 404s due to path mismatch).

## Best Practices
- **Health First**: Run a `/health` check before executing full suites.
- **Pydantic Validation**: Ensure all TestSprite payloads match the Pydantic models in `src/core/schemas.py`.
- **Role-Based Security**: Explicitly test 401/403 responses by simulating missing or invalid Bearer tokens in headers.

> [!IMPORTANT]
> TestSprite is an agentic tool. Provide it with the `PROJECT_CONTEXT_SUMMARY.md` to ensure it understands the Screaming Architecture and 3-Tier Law before it starts generating tests.
