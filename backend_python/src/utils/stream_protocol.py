import json
from typing import AsyncGenerator, Any

async def stream_text(text: str) -> AsyncGenerator[str, None]:
    """
    Formats text chunks according to the Vercel AI SDK Data Stream Protocol.
    Format: 0:"<text_chunk>"\n
    """
    # Simply wrap the text in the protocol format
    yield f'0:{json.dumps(text)}\n'

async def stream_data(data: Any) -> AsyncGenerator[str, None]:
    """
    Formats arbitrary data chunks (tools, metadata) for Vercel AI SDK.
    Format: 2:[<json_data>]\n
    """
    yield f'2:{json.dumps([data])}\n'

async def stream_error(error: str) -> AsyncGenerator[str, None]:
    """
    Formats error messages for the client.
    Format: 3:"<error_message>"\n
    Args:
        error: Error message string
    """
    yield f'3:{json.dumps({"error": error})}\n'

async def stream_tool_call(
    tool_call_id: str,
    tool_name: str,
    args: dict[str, Any]
) -> AsyncGenerator[str, None]:
    """
    Formats tool call events for Vercel AI SDK.
    Format: 9:{"toolCallId":"...","toolName":"...","args":{...}}\n
    Args:
        tool_call_id: Unique identifier for this tool call
        tool_name: Name of the tool being invoked
        args: Tool arguments as dictionary
    """
    yield f'9:{json.dumps({"toolCallId": tool_call_id, "toolName": tool_name, "args": args})}\n'

async def stream_tool_result(
    tool_call_id: str,
    result: Any
) -> AsyncGenerator[str, None]:
    """
    Formats tool result events for Vercel AI SDK.
    Format: a:{"toolCallId":"...","result":...}\n
    Args:
        tool_call_id: Unique identifier matching the original tool call
        result: Tool execution result (can be any JSON-serializable type)
    """
    yield f'a:{json.dumps({"toolCallId": tool_call_id, "result": result})}\n'
