import asyncio
import os
import sys

# Setup paths
sys.path.insert(0, os.path.abspath("backend_python"))
from backend_python.src.core.config import settings
import vertexai

vertexai.init(project=settings.GOOGLE_CLOUD_PROJECT, location=settings.ADK_LOCATION)

from backend_python.src.adk.agents import syd_orchestrator
from backend_python.src.adk.session import get_session_service
from google.adk.runners import Runner
from google.genai import types
import uuid

async def main():
    session_id = str(uuid.uuid4())
    session_service = get_session_service()
    
    runner = Runner(
        app_name="test_orchestrator",
        agent=syd_orchestrator,
        session_service=session_service,
    )
    
    actual_message = types.Content(role="user", parts=[types.Part(text="Generami un rendering per la stanza da bagno")])
    
    try:
        async for event in runner.run_async(
            session_id=session_id,
            user_id="test_user",
            new_message=actual_message
        ):
            print(f"\\n--- EVENT: {getattr(event, 'event_type', 'unknown')} ---")
            if event.content and event.content.parts:
                for idx, part in enumerate(event.content.parts):
                    if hasattr(part, 'text') and part.text:
                        print(f"Part {idx} (TEXT): {part.text[:50]}...")
                    elif hasattr(part, 'function_call') and part.function_call:
                        print(f"Part {idx} (FC): name={part.function_call.name}, args={part.function_call.args}")
                    elif hasattr(part, 'function_response') and part.function_response:
                        print(f"Part {idx} (FR): name={part.function_response.name}, response={type(part.function_response.response)}")
                    else:
                        print(f"Part {idx} (UNKNOWN): {type(part)}")
            else:
                print("Event has no content parts")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    asyncio.run(main())
