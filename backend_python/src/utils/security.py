"""
Security utilities for file validation and sanitization.

This module provides security-critical functions for validating uploaded files
beyond simple MIME type checks, including Magic Bytes validation.
"""

import logging
from typing import Optional
from fastapi import HTTPException, UploadFile

logger = logging.getLogger(__name__)

# Magic Bytes signatures for allowed video formats
VIDEO_SIGNATURES = {
    "video/mp4": [
        bytes.fromhex("00 00 00 18 66 74 79 70"),  # ftyp (MP4 container)
        bytes.fromhex("00 00 00 20 66 74 79 70"),  # ftyp (alternative)
        bytes.fromhex("00 00 00 1C 66 74 79 70"),  # ftyp (alternative)
    ],
    "video/quicktime": [
        bytes.fromhex("00 00 00 14 66 74 79 70 71 74"),  # ftypqt (QuickTime)
    ],
    "video/webm": [
        bytes.fromhex("1A 45 DF A3"),  # EBML header (WebM/MKV)
    ],
    "video/x-matroska": [
        bytes.fromhex("1A 45 DF A3"),  # EBML header (Matroska)
    ],
}

# Magic Bytes signatures for allowed image formats
IMAGE_SIGNATURES = {
    "image/jpeg": [
        bytes.fromhex("FF D8 FF E0"),  # JFIF
        bytes.fromhex("FF D8 FF E1"),  # EXIF
        bytes.fromhex("FF D8 FF E8"),  # SPIFF
        bytes.fromhex("FF D8 FF DB"),  # Raw JPEG (no marker)
        bytes.fromhex("FF D8 FF EE"),  # Adobe JPEG
    ],
    "image/png": [
        bytes.fromhex("89 50 4E 47 0D 0A 1A 0A"),  # PNG
    ],
    "image/gif": [
        bytes.fromhex("47 49 46 38 37 61"),  # GIF87a
        bytes.fromhex("47 49 46 38 39 61"),  # GIF89a
    ],
    "image/webp": [
        # WebP starts with RIFF....WEBP (bytes 0-3: RIFF, bytes 8-11: WEBP)
        # We check first 4 bytes for RIFF
        bytes.fromhex("52 49 46 46"),  # RIFF (WebP container)
    ],
}


async def validate_video_magic_bytes(file: UploadFile, max_header_size: int = 2048) -> str:
    """
    Validate video file using Magic Bytes inspection.
    
    This is a critical security function that prevents attackers from uploading
    malicious files disguised as videos by renaming them (e.g., exploit.exe -> video.mp4).
    
    Args:
        file: The uploaded file object
        max_header_size: Number of bytes to read for signature detection
        
    Returns:
        Detected MIME type
        
    Raises:
        HTTPException(400): If file signature doesn't match declared type
        
    Security Note:
        This function uses a whitelist approach - only explicitly allowed
        video signatures are permitted. Any unknown signature is rejected.
    """
    try:
        # Read file header (first N bytes contain the magic signature)
        header = await file.read(max_header_size)
        
        # Reset file pointer for subsequent reads
        await file.seek(0)
        
        if len(header) < 8:
            raise HTTPException(
                status_code=400,
                detail="File too small or corrupted. Minimum 8 bytes required."
            )
        
        # Check against known video signatures
        detected_type: Optional[str] = None
        
        for mime_type, signatures in VIDEO_SIGNATURES.items():
            for signature in signatures:
                if header.startswith(signature):
                    detected_type = mime_type
                    break
            if detected_type:
                break
        
        # Validate match between declared and detected types
        declared_type = file.content_type
        
        if not detected_type:
            logger.warning(f"🚨 Security Alert: Rejected file with unknown signature. "
                          f"Declared: {declared_type}, Header: {header[:16].hex()}")
            raise HTTPException(
                status_code=400,
                detail="Security validation failed. File signature not recognized as a valid video format."
            )
        
        # Allow minor MIME type variations (e.g., video/mp4 vs video/x-m4v)
        # Both declared and detected should be video/*
        if not declared_type or not declared_type.startswith("video/"):
            raise HTTPException(
                status_code=400,
                detail=f"Security Alert: File claims to be {declared_type} but detected as {detected_type}"
            )
        
        logger.info(f"✅ Magic Bytes validation passed: {detected_type}")
        return detected_type
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during magic bytes validation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="File validation failed. Please try again."
        )


async def validate_image_magic_bytes(file: UploadFile, max_header_size: int = 16) -> str:
    """
    Validate image file using Magic Bytes inspection.
    
    Prevents attackers from uploading malicious files disguised as images
    by renaming them (e.g., exploit.exe -> image.jpg).
    
    Args:
        file: The uploaded file object
        max_header_size: Number of bytes to read for signature detection
        
    Returns:
        Detected MIME type
        
    Raises:
        HTTPException(400): If file signature doesn't match an allowed image type
    """
    try:
        header = await file.read(max_header_size)
        await file.seek(0)
        
        if len(header) < 4:
            raise HTTPException(
                status_code=400,
                detail="File too small or corrupted. Minimum 4 bytes required."
            )
        
        detected_type: Optional[str] = None
        
        for mime_type, signatures in IMAGE_SIGNATURES.items():
            for signature in signatures:
                if header.startswith(signature):
                    # Extra check for WebP: bytes 8-11 must be "WEBP"
                    if mime_type == "image/webp":
                        if len(header) >= 12 and header[8:12] == b'WEBP':
                            detected_type = mime_type
                    else:
                        detected_type = mime_type
                    break
            if detected_type:
                break
        
        declared_type = file.content_type
        
        if not detected_type:
            logger.warning(
                f"🚨 Security Alert: Rejected file with unknown image signature. "
                f"Declared: {declared_type}, Header: {header[:16].hex()}"
            )
            raise HTTPException(
                status_code=400,
                detail="Security validation failed. File signature not recognized as a valid image format."
            )
        
        # Strict MIME type validation
        # We allow 'image/jpg' as an alias for 'image/jpeg'
        is_jpeg_alias = (declared_type == "image/jpg" and detected_type == "image/jpeg")
        
        if not declared_type:
            raise HTTPException(
                status_code=400,
                detail="Missing Content-Type header for image upload"
            )
        
        if declared_type != detected_type and not is_jpeg_alias:
            logger.warning(
                f"🚨 MIME Type Mismatch: Declared={declared_type}, Detected={detected_type}"
            )
            raise HTTPException(
                status_code=400,
                detail=f"Security Alert: File claims to be {declared_type} but detected as {detected_type}"
            )
        
        logger.info(f"✅ Image Magic Bytes validation passed: {detected_type}")
        return detected_type
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error during image magic bytes validation: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Image validation failed. Please try again."
        )


async def sanitize_filename(filename: str, max_length: int = 255) -> str:
    """
    Sanitize uploaded filename to prevent path traversal attacks.
    
    Removes or replaces dangerous characters that could be used in attacks like:
    - ../../../etc/passwd
    - file<script>.mp4
    
    Args:
        filename: Original filename
        max_length: Maximum allowed filename length
        
    Returns:
        Sanitized filename safe for storage
    """
    import re
    
    # Remove path components (e.g., ../../)
    safe_name = filename.split("/")[-1].split("\\")[-1]
    
    # Remove non-alphanumeric characters except dots, dashes, underscores
    safe_name = re.sub(r'[^a-zA-Z0-9._-]', '_', safe_name)
    
    # Limit length
    if len(safe_name) > max_length:
        # Keep extension
        parts = safe_name.rsplit('.', 1)
        if len(parts) == 2:
            name, ext = parts
            max_name_len = max_length - len(ext) - 1
            safe_name = name[:max_name_len] + '.' + ext
        else:
            safe_name = safe_name[:max_length]
    
    return safe_name or "unnamed_file"
