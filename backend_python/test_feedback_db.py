import asyncio
from src.db.firebase_client import get_async_firestore_client

async def check():
    db = get_async_firestore_client()
    f_docs = db.collection_group('feedback').limit(10).stream()
    async for d in f_docs:
        doc = d.to_dict()
        sid = doc.get('session_id') or d.reference.parent.parent.id
        mid = doc.get('message_id')
        print(f"Feedback for msg {mid} in {sid}")
        msg_snap = await db.collection('sessions').document(sid).collection('messages').document(mid).get()
        if msg_snap.exists:
            print(f"  -> Message EXISTS! {msg_snap.to_dict().get('content', '')[:20]}")
            print(f"  -> Rating: {msg_snap.to_dict().get('rating')}")
        else:
            print("  -> Message DOES NOT EXIST")

asyncio.run(check())
