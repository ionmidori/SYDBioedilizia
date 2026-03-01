import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from src.services.gallery_service import GalleryService
from src.schemas.gallery import GalleryResponse

@pytest.mark.asyncio
async def test_get_all_assets_success(mocker):
    # Mock dependencies
    mock_db = MagicMock()
    mocker.patch("src.services.gallery_service.get_async_firestore_client", return_value=mock_db)
    
    mock_projects = [
        MagicMock(session_id="p1", title="Project 1"),
        MagicMock(session_id="p2", title="Project 2")
    ]
    mocker.patch("src.services.gallery_service.get_user_projects", return_value=mock_projects)
    
    # Mock Firestore docs
    mock_doc1 = MagicMock()
    mock_doc1.id = "doc1"
    mock_doc1.to_dict.return_value = {
        "type": "image",
        "url": "http://p1.img",
        "name": "Image 1",
        "uploadedAt": datetime.now(),
        "uploadedBy": "user1"
    }
    
    mock_doc2 = MagicMock()
    mock_doc2.id = "doc2"
    mock_doc2.to_dict.return_value = {
        "type": "document",
        "url": "http://p2.pdf",
        "name": "Doc 1",
        "uploadedAt": datetime.now(),
        "uploadedBy": "user1"
    }

    # Setup async streams
    async def mock_stream_p1():
        yield mock_doc1

    async def mock_stream_p2():
        yield mock_doc2

    # Mock collection queries
    mock_proj1 = MagicMock()
    mock_proj1.collection.return_value.order_by.return_value.limit.return_value.stream.side_effect = mock_stream_p1
    
    mock_proj2 = MagicMock()
    mock_proj2.collection.return_value.order_by.return_value.limit.return_value.stream.side_effect = mock_stream_p2
    
    def mock_document_side_effect(p_id):
        if p_id == "p1": return mock_proj1
        if p_id == "p2": return mock_proj2
        return MagicMock()

    mock_db.collection.return_value.document.side_effect = mock_document_side_effect


    # Execute service
    service = GalleryService()
    response = await service.get_all_assets("user_id", limit=10)
    
    # Assertions
    assert isinstance(response, GalleryResponse)
    assert len(response.assets) == 2
    assert response.assets[0].type in ["image", "quote"]
    assert response.assets[1].type in ["image", "quote"]
    assert response.assets[0].metadata.projectName in ["Project 1", "Project 2"]
