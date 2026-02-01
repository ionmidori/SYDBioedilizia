"""
Robust JSON extraction utilities for parsing LLM responses.

Handles "dirty" outputs containing Chain of Thought reasoning,
code execution traces, and final JSON blocks.
"""
import re
import json
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


def extract_json_response(text: str) -> Optional[Dict[str, Any]]:
    """
    Extract JSON from LLM response with CoT/Code Execution artifacts.
    
    Attempts multiple extraction strategies:
    1. Look for JSON within ```json...``` code blocks
    2. Fallback: Find first { to last } pair
    
    Args:
        text: Raw LLM response text (may contain thoughts, code, JSON)
        
    Returns:
        Parsed dict if successful, None otherwise
        
    Example Input:
        '''
        Let me analyze this step-by-step...
        
        ```python
        # Counting windows
        count = 3
        ```
        
        ```json
        {"roomType": "kitchen", "windows": 3}
        ```
        '''
        
    Example Output:
        {"roomType": "kitchen", "windows": 3}
    """
    if not text:
        logger.warning("[JSONParser] Empty input text")
        return None
    
    # Strategy 1: Extract from ```json...``` block
    json_block_pattern = r"```json\s*(\{.*?\})\s*```"
    match = re.search(json_block_pattern, text, re.DOTALL)
    
    if match:
        try:
            json_str = match.group(1)
            return json.loads(json_str)
        except json.JSONDecodeError as e:
            logger.error(f"[JSONParser] Failed to parse ```json block: {e}")
    
    # Strategy 2: Find raw JSON braces (fallback)
    try:
        start = text.index('{')
        end = text.rindex('}') + 1
        json_str = text[start:end]
        return json.loads(json_str)
    except (ValueError, json.JSONDecodeError) as e:
        logger.error(f"[JSONParser] Fallback extraction failed: {e}")
        logger.debug(f"[JSONParser] Raw text (first 500 chars): {text[:500]}")
        return None
