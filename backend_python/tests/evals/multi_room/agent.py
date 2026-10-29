"""Agent module of the multi-room eval (Phase 138).

The production App (src/adk/app_factory.py: plugins, history compaction, context
cache), so the model reads the session block (login state, STANZE DEL PROGETTO,
STANZA ATTIVA) as it does in production. The eval case seeds that state through
`session_input`. `RESPONSES` records each turn's reply and token usage,
`TOOL_CALLS` each turn's tool calls, for the backend checks (fakes.py).

The compaction threshold is lower than in production: the quote agent's static
prompt and tools are ~9.2k tokens and a 12-turn chat reaches ~11k (measured
2026-10-28), so at 10k the long-chat set is compacted around turn 8 and its last
turns must recall facts from the summary. The other sets stay below it.
AgentEvaluator requires the module name to end with `.agent`.
"""
from src.adk.agents import syd_orchestrator
from src.adk.app_factory import build_app
from src.adk.compaction import build_events_compaction_config
from tests.evals.multi_room.fakes import RESPONSES, TOOL_CALLS

EVAL_COMPACTION_TOKEN_THRESHOLD = 10_000
EVAL_COMPACTION_EVENT_RETENTION = 4

root_agent = syd_orchestrator
app = build_app(
    extra_plugins=[RESPONSES, TOOL_CALLS],
    compaction=build_events_compaction_config(
        token_threshold=EVAL_COMPACTION_TOKEN_THRESHOLD,
        event_retention_size=EVAL_COMPACTION_EVENT_RETENTION,
    ),
)
