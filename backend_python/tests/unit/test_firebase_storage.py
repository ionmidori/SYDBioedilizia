"""src.storage.firebase_storage.get_storage_client."""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from src.storage.firebase_storage import get_storage_client


def test_builds_client_from_admin_app_credentials():
    app = MagicMock()
    app.project_id = "test-project"
    credential = MagicMock()
    app.credential.get_credential.return_value = credential
    client = MagicMock()

    with patch("src.storage.firebase_storage.init_firebase"), \
         patch("src.storage.firebase_storage.firebase_admin.get_app", return_value=app), \
         patch("src.storage.firebase_storage.storage.Client", return_value=client) as client_cls:
        assert get_storage_client() is client

    client_cls.assert_called_once_with(credentials=credential, project="test-project")


def test_raises_when_admin_app_not_initialized():
    with patch("src.storage.firebase_storage.init_firebase"), \
         patch("src.storage.firebase_storage.firebase_admin.get_app", side_effect=ValueError("not initialized")):
        with pytest.raises(ValueError, match="Firebase Admin app not initialized"):
            get_storage_client()
