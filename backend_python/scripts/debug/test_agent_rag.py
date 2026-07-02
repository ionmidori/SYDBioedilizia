import asyncio
from src.adk.agents import root_agent

async def main():
    print("Sending query to ADK Orchestrator...")
    
    # Simulating a user session
    from src.services.session_service import get_session_service
    session_service = get_session_service("in-memory")
    session_id = "test-rag-session"
    
    response = await root_agent.run(
        input="Ciao SYD, vorrei sapere quali sono le tempistiche e i massimali per il bonus ristrutturazioni nel 2026.",
        session_id=session_id
    )
    
    print("\n=== AGENT RESPONSE ===")
    print(response.text)

if __name__ == "__main__":
    asyncio.run(main())
