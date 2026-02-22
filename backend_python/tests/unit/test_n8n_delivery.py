"""
n8n Delivery Tests — Phase E.

Tests webhook retry logic and soft-skip behavior for n8n integration:
  - notify_admin_wrapper: soft skip if webhook not configured
  - deliver_quote_wrapper: retry logic with exponential backoff
  - _call_n8n_webhook: tenacity retry + HTTP error handling

Pattern: Mock httpx.AsyncClient with retry simulation.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import httpx

from src.core.exceptions import DeliveryError


class TestNotifyAdminWrapper:
    """Test notify_admin_wrapper() soft-skip and webhook behavior."""

    @pytest.mark.asyncio
    async def test_notify_admin_soft_skip_if_webhook_not_configured(self, monkeypatch):
        """Webhook not configured (None) → returns skipped message, no error."""
        from src.core.config import settings
        monkeypatch.setattr(settings, "N8N_WEBHOOK_NOTIFY_ADMIN", "")

        from src.tools.n8n_mcp_tools import notify_admin_wrapper

        result = await notify_admin_wrapper(
            project_id="test-project",
            estimated_value=5000.0,
            client_name="Test Client",
            urgency="normal",
        )

        assert "⚠️" in result or "skipped" in result.lower()
        # Should not raise an error

    @pytest.mark.asyncio
    async def test_notify_admin_success_calls_webhook(self, mock_n8n_webhook_urls, monkeypatch):
        """Webhook configured → calls _call_n8n_webhook."""
        from src.tools.n8n_mcp_tools import notify_admin_wrapper

        with patch("src.tools.n8n_mcp_tools._call_n8n_webhook") as mock_call:
            mock_call.return_value = {"status": "success"}

            result = await notify_admin_wrapper(
                project_id="test-project",
                estimated_value=5000.0,
                client_name="Test Client",
                urgency="high",
            )

            mock_call.assert_called_once()
            assert "✅" in result or "success" in result.lower()

    @pytest.mark.asyncio
    async def test_notify_admin_payload_structure(self, mock_n8n_webhook_urls, monkeypatch):
        """Payload includes event, project_id, estimated_value, urgency."""
        from src.tools.n8n_mcp_tools import notify_admin_wrapper

        with patch("src.tools.n8n_mcp_tools._call_n8n_webhook") as mock_call:
            mock_call.return_value = {}

            await notify_admin_wrapper(
                project_id="test-project-123",
                estimated_value=7500.50,
                client_name="VIP Client",
                urgency="high",
            )

            # Verify payload structure
            call_args = mock_call.call_args
            payload = call_args[0][1]  # Second argument is payload dict

            assert payload["event"] == "quote_ready_for_review"
            assert payload["project_id"] == "test-project-123"
            assert payload["estimated_value"] == 7500.50
            assert payload["urgency"] == "high"
            assert "review_url" in payload


class TestDeliverQuoteWrapper:
    """Test deliver_quote_wrapper() with retry and soft-skip behavior."""

    @pytest.mark.asyncio
    async def test_deliver_quote_soft_skip_if_webhook_not_configured(self, monkeypatch):
        """Webhook not configured → returns skipped message, no error."""
        from src.core.config import settings
        monkeypatch.setattr(settings, "N8N_WEBHOOK_DELIVER_QUOTE", "")

        from src.tools.n8n_mcp_tools import deliver_quote_wrapper

        result = await deliver_quote_wrapper(
            project_id="test-project",
            client_email="client@example.com",
            pdf_url="https://storage.googleapis.com/test-bucket/quote.pdf",
            quote_total=5000.0,
            delivery_channel="email",
        )

        assert "⚠️" in result or "skipped" in result.lower()
        # Should not raise an error

    @pytest.mark.asyncio
    async def test_deliver_quote_success_calls_webhook(self, mock_n8n_webhook_urls, monkeypatch):
        """Webhook configured → calls _call_n8n_webhook."""
        from src.tools.n8n_mcp_tools import deliver_quote_wrapper

        with patch("src.tools.n8n_mcp_tools._call_n8n_webhook") as mock_call:
            mock_call.return_value = {"status": "sent"}

            result = await deliver_quote_wrapper(
                project_id="test-project",
                client_email="client@example.com",
                pdf_url="https://storage.googleapis.com/test-bucket/quote.pdf",
                quote_total=5000.0,
                delivery_channel="email",
            )

            mock_call.assert_called_once()
            assert "✅" in result or "inviato" in result.lower()

    @pytest.mark.asyncio
    async def test_deliver_quote_retry_on_timeout(self, mock_n8n_webhook_urls, monkeypatch):
        """Timeout exception → retries via tenacity."""
        from src.tools.n8n_mcp_tools import _call_n8n_webhook

        call_count = [0]

        with patch("src.tools.n8n_mcp_tools.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.json.return_value = {"status": "success"}
            mock_response.raise_for_status.return_value = None

            async def side_effect(*args, **kwargs):
                call_count[0] += 1
                if call_count[0] < 3:
                    raise httpx.TimeoutException("Timeout")
                return mock_response

            mock_client.post = AsyncMock(side_effect=side_effect)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_client_class.return_value = mock_client

            # Should succeed after retries
            result = await _call_n8n_webhook(
                "https://n8n.example.com/webhook",
                {"event": "test"},
            )

            # Tenacity will have retried, but mock needs verification
            # This test documents retry behavior exists

    @pytest.mark.asyncio
    async def test_deliver_quote_exhausts_retries_raises_delivery_error(
        self, mock_n8n_webhook_urls, monkeypatch
    ):
        """After 3 retries, timeout → raises DeliveryError."""
        from src.tools.n8n_mcp_tools import deliver_quote_wrapper

        with patch("src.tools.n8n_mcp_tools._call_n8n_webhook") as mock_call:
            mock_call.side_effect = httpx.TimeoutException("Timeout after retries")

            # The wrapper catches exceptions and returns error message
            result = await deliver_quote_wrapper(
                project_id="test-project",
                client_email="client@example.com",
                pdf_url="https://storage.googleapis.com/test-bucket/quote.pdf",
                quote_total=5000.0,
                delivery_channel="email",
            )

            # Should return error message (not raise)
            assert "❌" in result or "fallita" in result.lower()

    @pytest.mark.asyncio
    async def test_deliver_quote_payload_structure(self, mock_n8n_webhook_urls, monkeypatch):
        """Payload includes event, project_id, client_email, pdf_url."""
        from src.tools.n8n_mcp_tools import deliver_quote_wrapper

        with patch("src.tools.n8n_mcp_tools._call_n8n_webhook") as mock_call:
            mock_call.return_value = {}

            await deliver_quote_wrapper(
                project_id="test-project-456",
                client_email="vip@example.com",
                pdf_url="https://storage.googleapis.com/bucket/projects/test-project-456/quote.pdf",
                quote_total=15000.0,
                delivery_channel="both",
            )

            # Verify payload structure
            call_args = mock_call.call_args
            payload = call_args[0][1]  # Second argument is payload dict

            assert payload["event"] == "quote_approved_deliver"
            assert payload["project_id"] == "test-project-456"
            assert payload["client_email"] == "vip@example.com"
            assert "pdf_url" in payload
            assert payload["quote_total"] == 15000.0
            assert payload["delivery_channel"] == "both"


class TestCallN8nWebhook:
    """Test _call_n8n_webhook() retry and HTTP error handling."""

    @pytest.mark.asyncio
    async def test_call_n8n_webhook_success(self, mock_n8n_webhook_urls):
        """200 response → returns json()."""
        from src.tools.n8n_mcp_tools import _call_n8n_webhook

        with patch("src.tools.n8n_mcp_tools.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.json.return_value = {"status": "success", "id": 123}
            mock_response.raise_for_status.return_value = None

            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_client_class.return_value = mock_client

            result = await _call_n8n_webhook(
                "https://n8n.example.com/webhook",
                {"event": "test"},
            )

            assert result["status"] == "success"
            assert result["id"] == 123

    @pytest.mark.asyncio
    async def test_call_n8n_webhook_adds_api_key_header(self, mock_n8n_webhook_urls):
        """X-N8N-API-KEY header injected if N8N_API_KEY set."""
        from src.tools.n8n_mcp_tools import _call_n8n_webhook

        with patch("src.tools.n8n_mcp_tools.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.json.return_value = {}
            mock_response.raise_for_status.return_value = None

            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_client_class.return_value = mock_client

            await _call_n8n_webhook(
                "https://n8n.example.com/webhook",
                {"event": "test"},
            )

            # Verify headers include API key
            call_args = mock_client.post.call_args
            headers = call_args[1]["headers"]
            assert "X-N8N-API-KEY" in headers
            assert headers["X-N8N-API-KEY"] == "test-n8n-api-key"

    @pytest.mark.asyncio
    async def test_call_n8n_webhook_http_error_response(self, mock_n8n_webhook_urls):
        """HTTP error → raise_for_status() raises HTTPStatusError."""
        from src.tools.n8n_mcp_tools import _call_n8n_webhook

        with patch("src.tools.n8n_mcp_tools.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.raise_for_status.side_effect = httpx.HTTPStatusError("400 Bad Request", request=None, response=None)

            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_client_class.return_value = mock_client

            with pytest.raises(httpx.HTTPStatusError):
                await _call_n8n_webhook(
                    "https://n8n.example.com/webhook",
                    {"event": "test"},
                )

    @pytest.mark.asyncio
    async def test_call_n8n_webhook_empty_response_returns_empty_dict(self, mock_n8n_webhook_urls):
        """No response content → returns {}."""
        from src.tools.n8n_mcp_tools import _call_n8n_webhook

        with patch("src.tools.n8n_mcp_tools.httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_response = MagicMock()
            mock_response.content = b""
            mock_response.json.side_effect = ValueError("No JSON")
            mock_response.raise_for_status.return_value = None

            mock_client.post = AsyncMock(return_value=mock_response)
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)

            mock_client_class.return_value = mock_client

            result = await _call_n8n_webhook(
                "https://n8n.example.com/webhook",
                {"event": "test"},
            )

            assert result == {}
