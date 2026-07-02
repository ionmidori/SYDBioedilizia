import asyncio
import os
import sys

os.environ["ENV"] = "development"
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = os.path.abspath("sydbioedilizia-firebase-adminsdk-h4fnt-38ea30a1b6.json")
sys.path.append(os.path.abspath("."))

from src.repositories.conversation_repository import get_conversation_repository

async def verify_old_chats():
    repo = get_conversation_repository()
    
    db = repo._get_async_db()
    docs = db.collection("sessions").order_by("updatedAt", direction="DESCENDING").limit(2).stream()
    
    async for d in docs:
        print(f"--- Session {d.id} ---")
        messages_ref = db.collection('sessions').document(d.id).collection('messages').stream()
        async for m in messages_ref:
            data = m.to_dict()
            content_preview = str(data.get('content', ''))[:30].replace('\n', ' ')
            role = data.get('role', 'UNKNOWN')
            print(f"[{role}] {content_preview} | has_tool_call_id: {'tool_call_id' in data} | timestamp: {data.get('timestamp')}")

if __name__ == "__main__":
    asyncio.run(verify_old_chats())
