
import json
from typing import AsyncGenerator, Any, Dict, List, Union

async def stream_text(text: str) -> AsyncGenerator[str, None]:
    """
    Formats text chunks according to the Vercel AI SDK Data Stream Protocol.
    Event '0': Text part.
    
    Format: 0:"<text_chunk>"\n
    """
    if text:
        yield f'0:{json.dumps(text)}\n'

async def stream_data(data: Union[Dict[str, Any], List[Any], str, int, float, bool]) -> AsyncGenerator[str, None]:
    """
    Formats arbitrary data chunks (tools, metadata) for Vercel AI SDK.
    Event '2': Data part.
    
    Format: 2:[<json_data>]\n
    """
    # Vercel expects a JSON array for the data part
    yield f'2:{json.dumps([data])}\n'

async def stream_error(error: str) -> AsyncGenerator[str, None]:
    """
    Formats error messages for the client.
    Event '3': Error part.
    
    Format: 3:"<error_message>"\n
    """
    yield f'3:{json.dumps(error)}\n'

async def stream_tool_call(
    tool_call_id: str,
    tool_name: str,
    args: Dict[str, Any]
) -> AsyncGenerator[str, None]:
    """
    Formats tool call events for Vercel AI SDK.
    Event '9': Tool Call part.
    
    Format: 9:{"toolCallId":"...","toolName":"...","args":{...}}\n
    """
    payload = {
        "toolCallId": tool_call_id,
        "toolName": tool_name,
        "args": args
    }
    yield f'9:{json.dumps(payload)}\n'

async def stream_tool_result(
    tool_call_id: str,
    result: Any
) -> AsyncGenerator[str, None]:
    """
    Formats tool result events for Vercel AI SDK.
    Event 'a': Tool Result part.
    
    Format: a:{"toolCallId":"...","result":...}\n
    """
    payload = {
        "toolCallId": tool_call_id,
        "result": result
    }
    yield f'a:{json.dumps(payload)}\n'

async def stream_status(message: str) -> AsyncGenerator[str, None]:
    """
    Formats status update events for Vercel AI SDK (Custom Protocol).
    Event '2': Data part.
    
    Format: 2:[{"type": "status", "message": "..."}]\n
    """
    payload = {
        "type": "status",
        "message": message
    }
    # Vercel Data Protocol expects a list
    yield f'2:{json.dumps([payload])}\n'

async def stream_reasoning(step_data: Dict[str, Any]) -> AsyncGenerator[str, None]:
    """
    Formats reasoning steps (CoT) for Vercel AI SDK.
    Event '2': Data part.
    
    Format: 2:[{"type": "reasoning", "data": {...}}]\n
    
    🛡️ SECURITY: 
    - Redacts 'tool_args' for sensitive tools (submit_lead, store_user_data).
    - Ensures 'analysis' is treated as plain text by frontend.
    """
    
    # 1. Clone to avoid mutating original state
    safe_data = step_data.copy()
    
    # 2. Redaction List
    SENSITIVE_TOOLS = ["submit_lead", "submit_lead_data", "store_user_data", "update_profile"]
    
    # 3. Apply Redaction
    if safe_data.get("tool_name") in SENSITIVE_TOOLS:
        safe_data["tool_args"] = {"REDACTED": "*** PII HIDDEN ***"}
        
    payload = {
        "type": "reasoning",
        "data": safe_data
    }
    yield f'2:{json.dumps([payload])}\n'
