"""Regression guards for SYD prompt efficiency, compaction threshold, and Perplexity env alias."""
from __future__ import annotations

from src.adk.agents import design_agent, quote_agent
from src.adk.tools import market_prices_adk
from src.core.config import Settings, settings


def test_compaction_threshold_triggers_before_15k_prompt_bloat():
    assert settings.ADK_COMPACTION_TOKEN_THRESHOLD == 13000


def test_design_agent_does_not_carry_market_prices_tool():
    from src.adk.agents import DESIGN_AGENT_INSTRUCTION

    assert market_prices_adk not in design_agent.tools
    assert market_prices_adk in quote_agent.tools
    assert "get_market_prices" not in DESIGN_AGENT_INSTRUCTION


def test_perplexity_api_key_accepts_cloud_run_plex_api_key_alias(monkeypatch):
    monkeypatch.delenv("PERPLEXITY_API_KEY", raising=False)
    monkeypatch.setenv("PLEX_API_KEY", "pplx-cloud-run-secret")
    cfg = Settings(_env_file=None)
    assert cfg.PERPLEXITY_API_KEY == "pplx-cloud-run-secret"
