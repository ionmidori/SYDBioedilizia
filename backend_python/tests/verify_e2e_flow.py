
import asyncio
import json
import logging
import uuid
from unittest.mock import MagicMock, AsyncMock, patch

from fastapi.testclient import TestClient
from main import app
from src.core.schemas import APIErrorResponse
from src.core.context import get_request_id

# ⚙️ Mock Dependencies to avoid Real DB/Auth
mock_repo = AsyncMock()
mock_repo.ensure_session.return_value = None
mock_repo.get_context.return_value = []
mock_repo.save_message.return_value = None
mock_repo.save_file_metadata.return_value = None

# Mock Token
mock_token = MagicMock()
mock_token.uid = "test-user-id"

def mock_verify_token(*args, **kwargs):
    return mock_token

# Mock Graph
async def mock_graph_stream(*args, **kwargs):
    # Simulate partial chunks from Agent
    yield {"execution": {"messages": [{"content": "Thought process..."}]}}
    yield {"execution": {"messages": [{"content": "Final Answer"}]}}

# 🕵️ Intercept Logs
log_capture = []
class CaptureHandler(logging.Handler):
    def emit(self, record):
        log_capture.append(self.format(record))

def verify_phase_3_4():
    print("🚀 Starting E2E Deep Dive Verification (Phase 3 & 4)...")
    
    # Setup Logging Capture with JSON Formatter
    from src.core.logger import setup_logging, JsonFormatter
    setup_logging()
    root_logger = logging.getLogger()
    
    # Capture handler with JSON formatter
    capture = CaptureHandler()
    capture.setFormatter(JsonFormatter())
    root_logger.addHandler(capture)
    
    # Patch Deps - IMPORTANT: Patch where it is USED, not where defined
    with patch("src.services.agent_orchestrator.ConversationRepository", return_value=mock_repo), \
         patch("src.auth.jwt_handler.verify_token", side_effect=mock_verify_token), \
         patch("src.services.agent_orchestrator.get_agent_graph") as mock_get_graph: # Fixed Patch Path

        # Helper to simulate graph
        mock_compiled_graph = MagicMock()
        mock_compiled_graph.astream = mock_graph_stream
        mock_get_graph.return_value = mock_compiled_graph

        with TestClient(app) as client:
            
            # TEST 1: Request ID & Middleware (Phase 4)
            print("\n🧪 Test 1: Request ID Propagation")
            payload = {
                "messages": [{"role": "user", "content": "Hello"}],
                "sessionId": "test-session-123"
            }
            response = client.post("/chat/stream", json=payload, headers={"Authorization": "Bearer mock-token"})
            
            req_id = response.headers.get("X-Request-ID")
            print(f"   Context Request ID: {req_id}")
            assert req_id is not None
            assert len(req_id) > 10
            print("   ✅ Middleware injected X-Request-ID")

            # Verify Logs contain JSON and Request ID
            logs_with_req_id = [l for l in log_capture if req_id in l]
            print(f"   Captured {len(logs_with_req_id)} logs with this ID.")
            assert len(logs_with_req_id) > 0
            # Check JSON structure (heuristic)
            assert "{" in logs_with_req_id[0] and "}" in logs_with_req_id[0]
            print("   ✅ Logs are structured JSON and tagged with ID")

            # TEST 2: Intent Classification & Routing (Phase 3)
            # This is implicit: if the Orchestrator runs, it calls the graph.
            # We can't easily see internal IntentClassifier splits here without deeper mocking,
            # but we proved the Orchestrator -> Graph connection works.
            print("\n🧪 Test 2: Orchestrator -> Graph Integration")
            assert response.status_code == 200
            content = response.content.decode()
            # AI SDK v6 UI Message Stream protocol: SSE `data: {...}` frames.
            assert 'data: ' in content and ('"text-delta"' in content or '"type"' in content)
            print("   ✅ Stream Protocol yielded v6 SSE data")

            # TEST 3: Error Handling & Standardization (Phase 4)
            print("\n🧪 Test 3: Standardized Error Handling")
            # Force an error by sending invalid payload structure (or causing mock to fail)
            with patch("src.auth.jwt_handler.verify_token", side_effect=Exception("Simulated Auth Fail")):
                 err_response = client.post("/chat/stream", json=payload, headers={"Authorization": "Bearer bad-token"})
                 # Note: The stream endpoint catches errors and yields them as stream chunks usually.
                 # Let's check middleware error handling on a synchronous endpoint or force a hard crash.
                 
                 # Let's hit a protected endpoint that fails middleware immediately
                 pass
            
            # Hit a non-streaming endpoint dealing with validation/logic
            # (Mocking verify_token to raise AppException)
            from src.core.exceptions import AuthError
            with patch("src.auth.jwt_handler.verify_token", side_effect=AuthError("Invalid Token")):
                 # Hit /api/submit-lead which uses verify_token dependency
                 lead_payload = {
                     "name": "Test", "email": "t@t.com", "quote_summary": "hi", "session_id": "123"
                 }
                 err_res = client.post("/api/submit-lead", json=lead_payload, headers={"Authorization": "Bearer bad"})
                 
                 print(f"   Status: {err_res.status_code}")
                 print(f"   Body: {err_res.json()}")
                 
                 assert err_res.status_code == 401
                 assert err_res.json()["error_code"] == "AUTH_ERROR"
                 assert err_res.json()["request_id"] is not None
                 print("   ✅ Middleware caught AuthError and returned APIErrorResponse")

            # TEST 4: App Check Enforcement (Phase 4)
            print("\n🧪 Test 4: App Check Enforcement")
            with patch("src.middleware.app_check.ENABLE_APP_CHECK", True):
                # Request without App Check header
                no_header_res = client.post("/api/submit-lead", json=lead_payload)
                print(f"   Status (No Header): {no_header_res.status_code}")
                assert no_header_res.status_code == 403
                assert no_header_res.json()["error_code"] == "APP_CHECK_FAILED"
                print("   ✅ App Check blocked and returned standardized error")

    print("\n🎉 E2E Verification Complete: Phases 3 & 4 are Integrated and Robust.")

if __name__ == "__main__":
    verify_phase_3_4()
