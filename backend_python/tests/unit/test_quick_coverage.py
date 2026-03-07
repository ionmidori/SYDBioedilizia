"""
Quick coverage boost for utility modules just below the 70% threshold.
Focuses on easy-to-test pure functions and mocked I/O paths.
"""
import pytest
import json
from unittest.mock import MagicMock, AsyncMock, patch


# ════════════════════════════════════════════════════════════════════════════
# src.utils.context — contextvars getters/setters
# ════════════════════════════════════════════════════════════════════════════

class TestContextModule:
    """Cover the 5 uncovered function bodies in context.py."""

    def test_get_current_user_id_default(self):
        from src.utils.context import get_current_user_id
        # Default value defined in ContextVar
        result = get_current_user_id()
        assert isinstance(result, str)

    def test_set_and_get_current_user_id(self):
        from src.utils.context import set_current_user_id, get_current_user_id
        set_current_user_id("user-abc")
        assert get_current_user_id() == "user-abc"

    def test_get_current_media_metadata_default(self):
        from src.utils.context import get_current_media_metadata
        # Resets to None per ContextVar default in new threads
        result = get_current_media_metadata()
        assert result is None or isinstance(result, dict)

    def test_set_and_get_current_media_metadata(self):
        from src.utils.context import set_current_media_metadata, get_current_media_metadata
        meta = {"trim_start": 0, "trim_end": 10}
        set_current_media_metadata(meta)
        assert get_current_media_metadata() == meta

    def test_set_and_get_is_anonymous(self):
        from src.utils.context import set_is_anonymous, get_is_anonymous
        set_is_anonymous(False)
        assert get_is_anonymous() is False
        set_is_anonymous(True)
        assert get_is_anonymous() is True


# ════════════════════════════════════════════════════════════════════════════
# src.storage.firebase_storage — get_storage_client
# ════════════════════════════════════════════════════════════════════════════

class TestFirebaseStorage:
    def test_get_storage_client_success(self):
        mock_app = MagicMock()
        mock_app.project_id = "test-project"
        mock_cred = MagicMock()
        mock_app.credential.get_credential.return_value = mock_cred

        mock_storage_client = MagicMock()

        with patch("src.storage.firebase_storage.init_firebase"), \
             patch("src.storage.firebase_storage.firebase_admin.get_app", return_value=mock_app), \
             patch("src.storage.firebase_storage.storage.Client", return_value=mock_storage_client) as MockClient:
            from src.storage.firebase_storage import get_storage_client
            result = get_storage_client()

        assert result is mock_storage_client
        MockClient.assert_called_once_with(credentials=mock_cred, project="test-project")

    def test_get_storage_client_firebase_not_initialized(self):
        with patch("src.storage.firebase_storage.init_firebase"), \
             patch("src.storage.firebase_storage.firebase_admin.get_app", side_effect=ValueError("not initialized")):
            from src.storage.firebase_storage import get_storage_client
            with pytest.raises(ValueError, match="Firebase Admin app not initialized"):
                get_storage_client()


# ════════════════════════════════════════════════════════════════════════════
# src.services.insight_engine — InsightEngine
# ════════════════════════════════════════════════════════════════════════════

class TestInsightEngine:

    def _make_engine(self):
        """Build InsightEngine with mocked genai client."""
        with patch("src.services.insight_engine.genai.Client") as MockClient, \
             patch("src.core.config.settings") as mock_settings:
            mock_settings.CHAT_MODEL_VERSION = "gemini-2.0-flash"
            mock_settings.api_key = "fake-key"
            mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"

            from src.services.insight_engine import InsightEngine
            engine = InsightEngine.__new__(InsightEngine)
            engine.model_name = "gemini-2.0-flash"
            engine.client = MockClient.return_value
            return engine

    def test_init_sets_model_name_from_settings(self):
        with patch("src.services.insight_engine.genai.Client"), \
             patch("src.services.insight_engine.settings") as mock_settings:
            mock_settings.CHAT_MODEL_VERSION = "gemini-test"
            mock_settings.api_key = "key"
            from src.services.insight_engine import InsightEngine
            engine = InsightEngine()
            assert engine.model_name == "gemini-test"

    def test_init_with_explicit_model_name(self):
        with patch("src.services.insight_engine.genai.Client"), \
             patch("src.services.insight_engine.settings") as mock_settings:
            mock_settings.api_key = "key"
            from src.services.insight_engine import InsightEngine
            engine = InsightEngine(model_name="custom-model")
            assert engine.model_name == "custom-model"

    def test_get_price_book_summary_includes_skus(self):
        engine = self._make_engine()
        price_book = [
            {"sku": "LAM-001", "description": "Laminate floor", "unit": "mq", "category": "flooring"},
            {"sku": "ELE-001", "description": "Electrical panel", "unit": "pz", "category": "electrical"},
        ]
        with patch("src.services.insight_engine.PricingService.load_price_book", return_value=price_book):
            summary = engine._get_price_book_summary()

        assert "LAM-001" in summary
        assert "ELE-001" in summary
        assert "Laminate floor" in summary

    @pytest.mark.asyncio
    async def test_analyze_project_basic(self):
        engine = self._make_engine()
        price_book = [{"sku": "LAM-001", "description": "Floor", "unit": "mq", "category": "floor"}]

        analysis_result = {
            "suggestions": [{"sku": "LAM-001", "qty": 20.0, "ai_reasoning": "User has 20mq room"}],
            "summary": "Basic flooring project"
        }

        mock_response = MagicMock()
        mock_response.text = json.dumps(analysis_result)
        engine.client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("src.services.insight_engine.PricingService.load_price_book", return_value=price_book), \
             patch("src.core.config.settings") as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
            from src.services.insight_engine import InsightEngine
            result = await engine.analyze_project_for_quote(
                chat_history=[{"role": "user", "content": "I have a 20mq room"}],
                media_urls=[]
            )

        assert result.summary == "Basic flooring project"
        assert len(result.suggestions) == 1
        assert result.suggestions[0].sku == "LAM-001"

    @pytest.mark.asyncio
    async def test_analyze_project_api_error_raises(self):
        engine = self._make_engine()
        price_book = [{"sku": "LAM-001", "description": "Floor", "unit": "mq", "category": "floor"}]
        engine.client.aio.models.generate_content = AsyncMock(side_effect=Exception("API quota exceeded"))

        with patch("src.services.insight_engine.PricingService.load_price_book", return_value=price_book), \
             patch("src.core.config.settings") as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
            with pytest.raises(Exception, match="Failed to analyze project"):
                await engine.analyze_project_for_quote(
                    chat_history=[{"role": "user", "content": "Help"}],
                    media_urls=[]
                )

    @pytest.mark.asyncio
    async def test_analyze_project_with_markdown_json(self):
        """Response wrapped in ```json should be stripped before parsing."""
        engine = self._make_engine()
        price_book = [{"sku": "LAM-001", "description": "Floor", "unit": "mq", "category": "floor"}]

        raw = '```json\n{"suggestions": [{"sku": "LAM-001", "qty": 5.0, "ai_reasoning": "test"}], "summary": "ok"}\n```'
        mock_response = MagicMock()
        mock_response.text = raw
        engine.client.aio.models.generate_content = AsyncMock(return_value=mock_response)

        with patch("src.services.insight_engine.PricingService.load_price_book", return_value=price_book), \
             patch("src.core.config.settings") as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
            result = await engine.analyze_project_for_quote(
                chat_history=[{"role": "user", "content": "test"}],
                media_urls=[]
            )

        assert result.summary == "ok"

    def test_get_insight_engine_singleton(self):
        with patch("src.services.insight_engine.genai.Client"), \
             patch("src.core.config.settings") as mock_settings:
            mock_settings.CHAT_MODEL_VERSION = "model"
            mock_settings.api_key = "key"

            import src.services.insight_engine as ie_mod
            ie_mod._insight_engine = None  # reset singleton

            from src.services.insight_engine import get_insight_engine, InsightEngine
            e1 = get_insight_engine()
            e2 = get_insight_engine()

            assert e1 is e2
            assert isinstance(e1, InsightEngine)
            ie_mod._insight_engine = None  # cleanup


# ════════════════════════════════════════════════════════════════════════════
# src.storage.upload — upload_base64_image, upload_file_bytes
# ════════════════════════════════════════════════════════════════════════════

_UPLOAD_SETTINGS = "src.storage.upload.settings"


class TestUpload:

    def _mock_storage(self):
        mock_blob = MagicMock()
        mock_blob.generate_signed_url.return_value = "https://storage.googleapis.com/signed?token=abc"
        mock_bucket = MagicMock()
        mock_bucket.blob.return_value = mock_blob
        mock_client = MagicMock()
        mock_client.bucket.return_value = mock_bucket
        return mock_client, mock_bucket, mock_blob

    def _patch_storage(self, mock_client):
        """Monkey-patch get_storage_client in firebase_storage module (lazy-imported by upload.py)."""
        import src.storage.firebase_storage as _fsmod
        orig = _fsmod.__dict__.get("get_storage_client")
        _fsmod.get_storage_client = lambda: mock_client
        return _fsmod, orig

    def _restore_storage(self, _fsmod, orig):
        if orig is not None:
            _fsmod.get_storage_client = orig
        elif "get_storage_client" in _fsmod.__dict__:
            del _fsmod.__dict__["get_storage_client"]

    def test_upload_base64_no_bucket_raises(self):
        with patch(_UPLOAD_SETTINGS) as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = ""
            from src.storage.upload import upload_base64_image
            with pytest.raises(Exception, match="FIREBASE_STORAGE_BUCKET"):
                upload_base64_image("data:image/png;base64,abc", "sess1")

    def test_upload_base64_with_data_uri(self):
        import base64
        mock_client, _, _ = self._mock_storage()
        img_bytes = b"\x89PNG\r\n" + b"x" * 100
        b64 = base64.b64encode(img_bytes).decode()
        data_uri = f"data:image/png;base64,{b64}"

        _fsmod, orig = self._patch_storage(mock_client)
        try:
            with patch(_UPLOAD_SETTINGS) as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
                from src.storage.upload import upload_base64_image
                url = upload_base64_image(data_uri, "sess1")
        finally:
            self._restore_storage(_fsmod, orig)

        assert "https://" in url

    def test_upload_base64_without_data_uri_prefix(self):
        import base64
        mock_client, _, _ = self._mock_storage()
        img_bytes = b"x" * 50
        b64 = base64.b64encode(img_bytes).decode()

        _fsmod, orig = self._patch_storage(mock_client)
        try:
            with patch(_UPLOAD_SETTINGS) as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
                from src.storage.upload import upload_base64_image
                url = upload_base64_image(b64, "sess1")
        finally:
            self._restore_storage(_fsmod, orig)

        assert "https://" in url

    def test_upload_base64_too_large_raises(self):
        import base64
        big_bytes = b"x" * (11 * 1024 * 1024)  # 11MB — exceeds 10MB limit
        b64 = base64.b64encode(big_bytes).decode()

        with patch(_UPLOAD_SETTINGS) as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
            from src.storage.upload import upload_base64_image
            with pytest.raises(Exception, match="too large"):
                upload_base64_image(b64, "sess1")

    def test_upload_file_bytes_no_bucket_raises(self):
        with patch(_UPLOAD_SETTINGS) as mock_settings:
            mock_settings.FIREBASE_STORAGE_BUCKET = ""
            from src.storage.upload import upload_file_bytes
            with pytest.raises(Exception, match="FIREBASE_STORAGE_BUCKET"):
                upload_file_bytes(b"data", "sess1", "file.pdf")

    def test_upload_file_bytes_success(self):
        mock_client, _, _ = self._mock_storage()
        _fsmod, orig = self._patch_storage(mock_client)
        try:
            with patch(_UPLOAD_SETTINGS) as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
                from src.storage.upload import upload_file_bytes
                url = upload_file_bytes(b"file content", "sess1", "doc.pdf", "application/pdf")
        finally:
            self._restore_storage(_fsmod, orig)

        assert "https://" in url

    def test_upload_file_bytes_storage_error_raises(self):
        mock_client = MagicMock()
        mock_client.bucket.side_effect = Exception("Storage unavailable")
        _fsmod, orig = self._patch_storage(mock_client)
        try:
            with patch(_UPLOAD_SETTINGS) as mock_settings:
                mock_settings.FIREBASE_STORAGE_BUCKET = "test.appspot.com"
                from src.storage.upload import upload_file_bytes
                with pytest.raises(Exception, match="Failed to upload file"):
                    upload_file_bytes(b"data", "sess1", "file.pdf")
        finally:
            self._restore_storage(_fsmod, orig)
