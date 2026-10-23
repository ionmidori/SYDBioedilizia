"""Agent module of the multi-room eval (Phase 138).

The production agents behind an App with `SessionContextPlugin`, so the model
reads the session block (login state, STANZE DEL PROGETTO, STANZA ATTIVA) as it
does in production. The eval case seeds that state through `session_input`.
AgentEvaluator requires the module name to end with `.agent`.
"""
from google.adk.apps.app import App
from src.adk.agents import syd_orchestrator
from src.adk.session_context_plugin import SessionContextPlugin

root_agent = syd_orchestrator
app = App(name="syd_orchestrator", root_agent=syd_orchestrator, plugins=[SessionContextPlugin()])
