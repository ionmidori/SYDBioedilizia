"""
ADK Agents Definition.
Implements the Multi-Agent routing pattern for Vertex AI Agent Engine.
"""
from google.adk.agents import Agent
from src.adk.tools import (
    pricing_engine_tool, market_prices, analyze_room,
    generate_render, show_project_gallery, list_project_files,
    suggest_quote_items, trigger_n8n_webhook, request_quote_approval
)
import logging

logger = logging.getLogger(__name__)

# Reusing instructions from existing system prompts conceptually
MODE_A_TRIAGE_PROMPT = "You are a Triage agent. Classify the user intent and gather basic info."
MODE_A_DESIGNER_PROMPT = "You are a Design agent. Generate renders and gallery ideas."
MODE_B_SURVEYOR_PROMPT = "You are a Surveyor agent. Use the pricing engine to build a quote."

triage_agent = Agent(
    name="triage",
    model="gemini-2.5-flash",
    tools=[analyze_room, show_project_gallery],
    instruction=MODE_A_TRIAGE_PROMPT,
)

design_agent = Agent(
    name="design",
    model="gemini-2.5-flash",
    tools=[generate_render, list_project_files],
    instruction=MODE_A_DESIGNER_PROMPT,
)

quote_agent = Agent(
    name="quote",
    model="gemini-2.5-flash",
    tools=[
        pricing_engine_tool, market_prices, suggest_quote_items,
        trigger_n8n_webhook, request_quote_approval
    ],
    instruction=MODE_B_SURVEYOR_PROMPT,
)

# Master Router Agent
syd_orchestrator = Agent(
    name="syd_orchestrator",
    model="gemini-2.5-flash",
    sub_agents=[triage_agent, design_agent, quote_agent],
    instruction="Route to the appropriate specialist based on conversation phase (triage, design, quote).",
)
