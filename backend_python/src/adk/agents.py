"""
ADK Agents Definition.
Implements the Multi-Agent routing pattern for Vertex AI Agent Engine.
"""
import logging
from google.adk.agents import Agent
from src.adk.tools import (
    pricing_engine_tool_adk,
    market_prices_adk,
    generate_render_adk,
    show_project_gallery_adk,
    list_project_files_adk,
    suggest_quote_items_adk,
    trigger_n8n_webhook_adk,
    request_quote_approval_adk,
)

logger = logging.getLogger(__name__)

MODE_A_TRIAGE_PROMPT = """You are a Triage and Vision expert agent. 
Analyze any images or videos provided by the user natively. 
Identify the room type, architectural style, spatial dimensions, materials, and any potential issues (e.g. humidity, damage).
Do NOT guess visual details if no media is provided. Rely strictly on the media provided in the chat stream."""
MODE_A_DESIGNER_PROMPT = "You are a Design agent. Generate renders and gallery ideas."
MODE_B_SURVEYOR_PROMPT = "You are a Surveyor agent. Use the pricing engine to build a quote."

triage_agent = Agent(
    name="triage",
    model="gemini-2.5-flash",
    tools=[show_project_gallery_adk],
    instruction=MODE_A_TRIAGE_PROMPT,
)

design_agent = Agent(
    name="design",
    model="gemini-2.5-flash",
    tools=[generate_render_adk, list_project_files_adk],
    instruction=MODE_A_DESIGNER_PROMPT,
)

quote_agent = Agent(
    name="quote",
    model="gemini-2.5-flash",
    tools=[
        pricing_engine_tool_adk, market_prices_adk, suggest_quote_items_adk,
        trigger_n8n_webhook_adk, request_quote_approval_adk,
    ],
    instruction=MODE_B_SURVEYOR_PROMPT,
)

syd_orchestrator = Agent(
    name="syd_orchestrator",
    model="gemini-2.5-flash",
    sub_agents=[triage_agent, design_agent, quote_agent],
    instruction="Route to the appropriate specialist based on conversation phase (triage, design, quote).",
)
