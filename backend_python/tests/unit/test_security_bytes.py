# Import the app - adjusting path as needed based on structure
# Assuming standard FastAPI structure where app is exposed in main.py
import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

sys.path.insert(0, str(Path(__file__).parent.parent.parent / "src"))

# We might need to mock imports if app creation has side effects
# But for now let's try to assume we can import the router or app

def test_magic_bytes_validation_valid_jpeg(sample_image_bytes):
    """Test that a valid JPEG passes magic bytes validation."""
    import asyncio

    from fastapi import UploadFile
    from src.utils.security import validate_image_magic_bytes

    # Mock UploadFile
    file = MagicMock(spec=UploadFile)
    file.filename = "test.jpg"
    file.content_type = "image/jpeg"

    # Mock async read/seek
    async def mock_read(size=-1):
        return sample_image_bytes[:size] if size > 0 else sample_image_bytes

    async def mock_seek(offset):
        pass

    file.read = mock_read
    file.seek = mock_seek

    # Run async test
    loop = asyncio.new_event_loop()
    result = loop.run_until_complete(validate_image_magic_bytes(file))
    loop.close()

    assert result == "image/jpeg"

def test_magic_bytes_validation_exe_renamed_to_jpg():
    """Test that an EXE file renamed to .jpg is rejected."""
    import asyncio

    from fastapi import HTTPException, UploadFile
    from src.utils.security import validate_image_magic_bytes

    # Create fake EXE content (Mz header)
    exe_bytes = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00"

    file = MagicMock(spec=UploadFile)
    file.filename = "innocent_image.jpg"
    file.content_type = "image/jpeg"

    async def mock_read(size=-1):
        return exe_bytes[:size] if size > 0 else exe_bytes

    async def mock_seek(offset):
        pass

    file.read = mock_read
    file.seek = mock_seek

    loop = asyncio.new_event_loop()

    with pytest.raises(HTTPException) as excinfo:
        loop.run_until_complete(validate_image_magic_bytes(file))

    assert excinfo.value.status_code == 400
    assert "File signature not recognized" in str(excinfo.value.detail) or "File claims to be" in str(excinfo.value.detail)

def test_magic_bytes_validation_mismatched_type(sample_image_bytes):
    """Test that a valid PNG renamed to .jpg (or declared as jpg) is rejected/detected."""
    import asyncio

    from fastapi import HTTPException, UploadFile
    from src.utils.security import validate_image_magic_bytes

    # Valid PNG bytes
    png_bytes = bytes.fromhex("89 50 4E 47 0D 0A 1A 0A 00 00 00 0D 49 48 44 52")

    file = MagicMock(spec=UploadFile)
    file.filename = "actually_png.jpg"
    file.content_type = "image/jpeg" # Lie about content type

    async def mock_read(size=-1):
        return png_bytes[:size] if size > 0 else png_bytes

    async def mock_seek(offset):
        pass

    file.read = mock_read
    file.seek = mock_seek

    loop = asyncio.new_event_loop()

    # It should raise 400 because declared type (jpeg) doesn't match detected type (png)
    # OR it might return the detected type depending on implementation strictness.
    # checking implementation: it raises if detected != declared

    with pytest.raises(HTTPException) as excinfo:
        loop.run_until_complete(validate_image_magic_bytes(file))

    assert excinfo.value.status_code == 400
