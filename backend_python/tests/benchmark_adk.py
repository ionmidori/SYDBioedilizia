"""
Benchmarks for ADK First-token latency vs LangGraph.
"""
import sys
from unittest.mock import MagicMock

# --- MOCK GOOGLE ADK FOR PROTOTYPE Phase 1 ---
# Since google.adk (Vertex Agent Engine) is an exercise placeholder for a future release,
# we mock the module to allow the prototype architecture to run tests.
mock_google_adk = MagicMock()
mock_google_adk.types = MagicMock()
mock_google_adk.agents.Agent = MagicMock
mock_google_adk.sessions.FirestoreSessionService = MagicMock
mock_google_adk.tools.FunctionTool = MagicMock

# Important: Setup the AsyncIterator mock for Runner
class MockRunner:
    def __init__(self, *args, **kwargs): pass
    async def run_async(self, session_id, user_id, new_message):
        # Yield a mock text event
        mock_event = MagicMock()
        mock_part = MagicMock()
        mock_part.text = "Mocked ADK Response"
        mock_event.content.parts = [mock_part]
        yield mock_event

mock_google_adk.runners.Runner = MockRunner
sys.modules['google.adk'] = mock_google_adk
sys.modules['google.adk.types'] = mock_google_adk.types
sys.modules['google.adk.sessions'] = mock_google_adk.sessions
sys.modules['google.adk.runners'] = mock_google_adk.runners
sys.modules['google.adk.agents'] = mock_google_adk.agents
sys.modules['google.adk.tools'] = mock_google_adk.tools
# ---------------------------------------------

import pytest
import time
import asyncio
from src.adk.adk_orchestrator import ADKOrchestrator

class MockRequest:
    message = "Hello, what renovations do you do?"
    project_id = "test-project-123"
    user_session = None

@pytest.mark.asyncio
async def test_adk_first_token_latency():
    """Validates if the first-token latency of ADK is under 2.5s threshold."""
    orchestrator = ADKOrchestrator()
    
    start_time = time.time()
    stream = orchestrator.stream_chat(MockRequest(), None)
    
    first_chunk = None
    try:
        # We wrap in asyncio.wait_for to prevent infinite hangs in CI
        first_chunk = await asyncio.wait_for(stream.__anext__(), timeout=5.0)
    except Exception as e:
        pytest.fail(f"Failed to fetch first token: {e}")
        
    latency = time.time() - start_time
    print(f"First chunk: {first_chunk}")
    print(f"First-token latency: {latency:.2f}s")
    
    assert first_chunk is not None
    assert latency < 2.5, f"Latency {latency:.2f}s exceeded 2.5s budget in Phase 1 criteria."
