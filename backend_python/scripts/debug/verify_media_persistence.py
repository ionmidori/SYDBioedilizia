import asyncio
import os
import uuid
import json
from datetime import datetime, timezone

# Ensure we're running from the correct dir
os.environ["ENV"] = "development"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath("sydbioedilizia-firebase-adminsdk-h4fnt-38ea30a1b6.json")
import sys
sys.path.append(os.path.abspath("."))

from src.repositories.conversation_repository import get_conversation_repository

async def verify_persistence():
    repo = get_conversation_repository()
    
    # We will use a fake session ID to avoid cluttering real projects
    test_session_id = f"test_session_{uuid.uuid4().hex[:8]}"
    test_uid = f"test_user_{uuid.uuid4().hex[:8]}"
    
    print(f"Creating session: {test_session_id}")
    await repo.ensure_session(test_session_id, test_uid)
    
    # 1. Test User Message with Structured Attachments
    structured_attachments = {
        "images": ["https://firebasestorage.googleapis.com/v0/b/test/o/photo1.jpg?alt=media"],
        "videos": ["https://firebasestorage.googleapis.com/v0/b/test/o/video1.mp4?alt=media"]
    }
    
    await repo.save_message(
        session_id=test_session_id,
        role="user",
        content="Ecco la mia stanza",
        attachments=structured_attachments,
        timestamp=datetime.now(timezone.utc)
    )
    print("✅ Saved user message with structured attachments")
    
    # 2. Save an assistant message that generates a tool call
    tool_calls = [{
        "id": "call_123",
        "name": "generate_render",
        "function": {"name": "generate_render", "arguments": {"project_request": "room"}}
    }]
    await repo.save_message(
        session_id=test_session_id,
        role="assistant",
        content="",
        tool_calls=tool_calls,
        timestamp=datetime.now(timezone.utc)
    )
    print("Assistant message with tool call saved.")
    
    # 3. Save a tool message with the response
    tool_response = {
        "status": "success",
        "imageUrl": "https://example.com/render.jpg"
    }
    await repo.save_message(
        session_id=test_session_id,
        role="tool",
        content=json.dumps(tool_response),
        tool_call_id="call_123",
        timestamp=datetime.now(timezone.utc)
    )
    print("Tool message with response saved.")
    
    # 4. Read the messages back
    print("\nRetrieving history...")
    history = await repo.get_context(test_session_id, limit=10)
    for msg in history:
        print(f"[{msg['role']}] {msg.get('content')}")
        if 'attachments' in msg:
            print(f"  Attachments: {msg['attachments']}")
        if 'tool_calls' in msg:
            print(f"  Tool Calls: {msg['tool_calls']}")
        if 'tool_call_id' in msg:
            print(f"  Tool Call ID: {msg['tool_call_id']}")

    print("\nVerification complete.")

if __name__ == "__main__":
    asyncio.run(verify_persistence())
