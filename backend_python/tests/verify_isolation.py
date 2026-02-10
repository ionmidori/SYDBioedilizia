import asyncio
import sys
import os
from datetime import datetime

# Add src to path
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

from src.repositories.conversation_repository import ConversationRepository
from src.core.config import settings

async def verify_isolation():
    print("🧪 Starting Project Isolation Verification...")
    
    repo = ConversationRepository()
    
    # Define two distinct sessions
    session_a = f"test_session_A_{int(datetime.now().timestamp())}"
    session_b = f"test_session_B_{int(datetime.now().timestamp())}"
    
    print(f"🔹 Session A: {session_a}")
    print(f"🔹 Session B: {session_b}")
    
    # 1. Ensure Sessions
    await repo.ensure_session(session_a)
    await repo.ensure_session(session_b)
    
    # 2. Add distinct messages
    msg_a = "Message for Project A Only"
    msg_b = "Message for Project B Only"
    
    await repo.save_message(session_a, "user", msg_a)
    await repo.save_message(session_b, "user", msg_b)
    
    print("✅ Messages saved to respective sessions.")
    
    # 3. Retrieve History and Verify
    history_a = await repo.get_context(session_a, limit=10)
    history_b = await repo.get_context(session_b, limit=10)
    
    # Extract content
    content_a = [m["content"] for m in history_a]
    content_b = [m["content"] for m in history_b]
    
    print(f"📜 History A: {content_a}")
    print(f"📜 History B: {content_b}")
    
    # Asserts
    if msg_a in content_a and msg_b not in content_a:
        print("✅ Session A isolation verified.")
    else:
        print("❌ Session A FAILED isolation check!")
        print(f"Expected {msg_a} in A, and NOT {msg_b}")
        
    if msg_b in content_b and msg_a not in content_b:
        print("✅ Session B isolation verified.")
    else:
        print("❌ Session B FAILED isolation check!")
        
    # Cleanup (Optional, but good for local dev)
    # await repo.db.collection("sessions").document(session_a).delete()
    # await repo.db.collection("sessions").document(session_b).delete()

if __name__ == "__main__":
    asyncio.run(verify_isolation())
