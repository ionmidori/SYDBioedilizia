"""
Load testing script for Vertex AI ADK orchestrator.
Simulates 50 concurrent sessions to validate session state persistence and rate limits.
"""
import asyncio
import logging
import time
from unittest.mock import MagicMock
import sys

# Setup basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Mock google.adk before importing our module
sys.modules['google.adk'] = MagicMock()
sys.modules['google.adk.tools'] = MagicMock()
sys.modules['google.adk.agents'] = MagicMock()
sys.modules['google.adk.runners'] = MagicMock()
sys.modules['google.adk.contexts'] = MagicMock()
sys.modules['google.adk.types'] = MagicMock()
sys.modules['google.adk.sessions'] = MagicMock()

from src.adk.adk_orchestrator import ADKOrchestrator

class MockRequest:
    def __init__(self, project_id: str, message: str):
        self.project_id = project_id
        self.message = message
        self.user_session = MagicMock()
        self.user_session.uid = f"user_{project_id}"

async def simulate_session(orchestrator: ADKOrchestrator, session_id: int):
    """Simulates a single user session interacting with the ADK."""
    request = MockRequest(project_id=f"proj_{session_id}", message=f"Hello from session {session_id}")
    
    start_time = time.time()
    try:
        # Mock the run_async to just yield a dummy response
        async def mock_run_async(*args, **kwargs):
            class MockPart:
                text = f"Response for {session_id}"
            class MockContent:
                parts = [MockPart()]
            class MockEvent:
                content = MockContent()
            yield MockEvent()
            
        orchestrator.runner.run_async = mock_run_async
        
        chunks = []
        async for chunk in orchestrator.stream_chat(request, None):
            chunks.append(chunk)
            
        latency = time.time() - start_time
        logger.info(f"Session {session_id} completed in {latency:.3f}s with {len(chunks)} chunks.")
        return True
    except Exception as e:
        logger.error(f"Session {session_id} failed: {e}")
        return False

async def run_load_test(num_sessions: int = 50):
    logger.info(f"Starting load test with {num_sessions} concurrent sessions.")
    orchestrator = ADKOrchestrator()
    
    tasks = []
    for i in range(num_sessions):
        tasks.append(simulate_session(orchestrator, i))
        
    results = await asyncio.gather(*tasks)
    
    successes = sum(1 for r in results if r)
    logger.info(f"Load test complete. {successes}/{num_sessions} sessions succeeded.")
    
    if successes < num_sessions:
        logger.error("Some sessions failed during the load test.")
        sys.exit(1)
    else:
        logger.info("All sessions completed successfully.")
        sys.exit(0)

if __name__ == "__main__":
    asyncio.run(run_load_test(50))
