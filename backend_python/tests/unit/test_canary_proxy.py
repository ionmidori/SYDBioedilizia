import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from src.services.orchestrator_factory import CanaryOrchestratorProxy
from src.core.config import settings

@pytest.fixture
def mock_repo():
    repo = MagicMock()
    repo.get_context = AsyncMock(return_value=[])  # Default to no messages (new session)
    return repo

@pytest.fixture
def mock_langgraph():
    return MagicMock()

@pytest.fixture
def mock_adk():
    return MagicMock()

@pytest.fixture
def proxy_instance(mock_repo, mock_adk, mock_langgraph):
    # Initialize as langgraph to avoid the __init__ try-except import of src.adk.adk_orchestrator
    with patch.object(settings, "ORCHESTRATOR_MODE", "langgraph"):
        proxy = CanaryOrchestratorProxy(mock_repo)
    
    proxy.adk_orchest = mock_adk
    proxy.langgraph_orchest = mock_langgraph
    return proxy

@pytest.mark.asyncio
async def test_canary_routes_to_langgraph_for_existing_session(mock_repo, proxy_instance):
    mock_repo.get_context.return_value = [{"role": "user", "content": "hello"}]
    
    with patch.object(settings, "ORCHESTRATOR_MODE", "canary"):
        target = await proxy_instance._get_target_orchestrator("test_session_123")
        
        assert target is proxy_instance.langgraph_orchest
        mock_repo.get_context.assert_called_once_with("test_session_123", limit=1)

@pytest.mark.asyncio
async def test_canary_routes_to_adk_based_on_hash_percentile(proxy_instance):
    with patch.object(settings, "ORCHESTRATOR_MODE", "canary"), \
         patch.object(settings, "ADK_CANARY_PERCENT", 100):  # 100% means always ADK
        
        target = await proxy_instance._get_target_orchestrator("new_session_abc")
        assert target is proxy_instance.adk_orchest

@pytest.mark.asyncio
async def test_canary_routes_to_langgraph_when_percentile_too_high(proxy_instance):
    with patch.object(settings, "ORCHESTRATOR_MODE", "canary"), \
         patch.object(settings, "ADK_CANARY_PERCENT", 0):  # 0% means never ADK
        
        target = await proxy_instance._get_target_orchestrator("new_session_def")
        assert target is proxy_instance.langgraph_orchest

@pytest.mark.asyncio
async def test_canary_exception_falls_back_to_langgraph(mock_repo, proxy_instance):
    mock_repo.get_context.side_effect = Exception("DB connection failed")
    
    with patch.object(settings, "ORCHESTRATOR_MODE", "canary"), \
         patch.object(settings, "ADK_CANARY_PERCENT", 100):
        
        target = await proxy_instance._get_target_orchestrator("test_session_error")
        assert target is proxy_instance.langgraph_orchest
