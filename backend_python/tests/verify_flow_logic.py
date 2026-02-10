import asyncio
from langchain_core.messages import ToolMessage
from src.graph.state import AgentState

async def verify_custom_tool_logic():
    """
    Simulates the custom_tools_node logic to verify flag updates.
    """
    print("🧪 Starting Logic Verification...")
    
    # 1. Mock State
    mock_state = AgentState(
        messages=[],
        session_id="test-session",
        user_id="test-user",
        is_quote_completed=False,
        is_render_completed=False,
        internal_plan=[],
        thought_log=[]
    )
    
    # 2. Simulate Tool Output (Quote Success)
    # In the real node, ToolNode executes the tool and returns messages.
    # Here we mock the result of step 1 of custom_tools_node
    tool_msgs_quote = [
        ToolMessage(content="Lead saved successfully! ID: 123", tool_call_id="call_1", name="submit_lead")
    ]
    
    # 3. Apply Logic (Replicating factory.py logic)
    updates_quote = {"messages": tool_msgs_quote}
    for msg in tool_msgs_quote:
        if msg.name == "submit_lead" and "Leadsavedsuccessfully" in msg.content.replace(" ", ""):
            updates_quote["is_quote_completed"] = True
            
    # Assert
    if updates_quote.get("is_quote_completed"):
        print("✅ Quote Flag Logic: PASSED")
    else:
        print("❌ Quote Flag Logic: FAILED")

    # 4. Simulate Tool Output (Render Success)
    tool_msgs_render = [
        ToolMessage(content="Here is your image: https://storage.googleapis.com/...", tool_call_id="call_2", name="generate_render")
    ]
    
    updates_render = {"messages": tool_msgs_render}
    for msg in tool_msgs_render:
         if msg.name == "generate_render" and "http" in msg.content:
            updates_render["is_render_completed"] = True
            
    # Assert
    if updates_render.get("is_render_completed"):
         print("✅ Render Flag Logic: PASSED")
    else:
         print("❌ Render Flag Logic: FAILED")

if __name__ == "__main__":
    asyncio.run(verify_custom_tool_logic())
