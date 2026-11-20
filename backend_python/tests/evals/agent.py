"""Agent module of the single-flow evals (quote, triage, design): the production agents.

AgentEvaluator (google-adk 2.x) loads an agent only from a module whose name ends with
`.agent`; `src.adk.agents` does not. The multi-room evals have their own module
(`multi_room/agent.py`: the production App with recorders).
"""
from src.adk.agents import root_agent

__all__ = ["root_agent"]
