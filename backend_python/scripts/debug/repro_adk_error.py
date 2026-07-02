
import asyncio
import uuid
from google.adk.runners import Runner
from google.adk.agents import Agent
from google.adk.sessions import InMemorySessionService
from google.genai import types

async def test_repro():
    agent = Agent(name="test", instruction="You are a test agent.")
    session_service = InMemorySessionService()
    # Enable auto_create_session to avoid the previous error
    runner = Runner(app_name="test_app", agent=agent, session_service=session_service, auto_create_session=True)
    
    session_id = str(uuid.uuid4())
    user_id = "test_user"
    
    # Simulate first message
    msg1 = types.Content(role="user", parts=[types.Part(text="Hello")])
    print(f"msg1: {msg1}")
    print(f"bool(msg1): {bool(msg1)}")
    
    print(f"Running msg1...")
    try:
        async for event in runner.run_async(session_id=session_id, user_id=user_id, new_message=msg1):
            print(f"Event: {getattr(event, 'event_type', 'content')}")
    except ValueError as e:
        print(f"Caught ValueError on msg1: {e}")
    except Exception as e:
        print(f"Caught exception on msg1: {type(e)} {e}")
        
    # Simulate empty-ish message
    msg2 = types.Content(role="user", parts=[])
    print(f"msg2 (empty parts): {msg2}")
    print(f"bool(msg2): {bool(msg2)}")
    
    print(f"Running msg2...")
    try:
        async for event in runner.run_async(session_id=session_id, user_id=user_id, new_message=msg2):
            print(f"Event: {getattr(event, 'event_type', 'content')}")
    except ValueError as e:
        print(f"Caught ValueError on msg2: {e}")

if __name__ == "__main__":
    asyncio.run(test_repro())
