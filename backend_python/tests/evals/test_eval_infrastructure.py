"""
Pytest integration tests for ADK evaluation infrastructure.

These tests validate that:
1. Eval set JSON files parse correctly into ADK models
2. Custom rubrics instantiate without errors
3. Eval config loads from test_config.json
4. Agent module exposes root_agent

These tests do NOT call live Gemini API — they validate structure only.
For live eval runs, use: uv run python tests/evals/run_evals.py
"""
import json
from pathlib import Path

import pytest
from google.adk.evaluation.eval_set import EvalSet

EVALS_DIR = Path(__file__).parent


class TestEvalSetParsing:
    """Verify all .test.json files parse into valid ADK EvalSet models."""

    @pytest.fixture
    def test_files(self) -> list[Path]:
        return list(EVALS_DIR.glob("*.test.json"))

    def test_test_files_exist(self, test_files: list[Path]) -> None:
        assert len(test_files) >= 3, f"Expected at least 3 .test.json files, found {len(test_files)}"

    @pytest.mark.parametrize("test_file", list(EVALS_DIR.glob("*.test.json")), ids=lambda p: p.stem)
    def test_loads_as_adk_eval_set(self, test_file: Path) -> None:
        """Schema guard: google-adk rejects files its EvalSet model cannot validate (snake_case keys)."""
        eval_set = EvalSet.model_validate_json(test_file.read_text(encoding="utf-8"))
        assert eval_set.eval_cases, f"Empty eval_cases in {test_file.name}"

    @pytest.mark.parametrize("test_file", list(EVALS_DIR.glob("*.test.json")), ids=lambda p: p.stem)
    def test_json_parses(self, test_file: Path) -> None:
        data = json.loads(test_file.read_text(encoding="utf-8"))
        assert "eval_set_id" in data, f"Missing eval_set_id in {test_file.name}"
        assert "eval_cases" in data, f"Missing eval_cases in {test_file.name}"
        assert len(data["eval_cases"]) > 0, f"Empty eval_cases in {test_file.name}"

    @pytest.mark.parametrize("test_file", list(EVALS_DIR.glob("*.test.json")), ids=lambda p: p.stem)
    def test_eval_cases_have_required_fields(self, test_file: Path) -> None:
        data = json.loads(test_file.read_text(encoding="utf-8"))
        for case in data["eval_cases"]:
            assert "eval_id" in case, f"Missing eval_id in case from {test_file.name}"
            assert "conversation" in case, f"Missing conversation in {case.get('eval_id', '?')}"
            for invocation in case["conversation"]:
                assert "user_content" in invocation, (
                    f"Missing user_content in invocation {invocation.get('invocation_id', '?')}"
                )


class TestEvalConfig:
    """Verify test_config.json is valid."""

    def test_config_exists(self) -> None:
        config_path = EVALS_DIR / "test_config.json"
        assert config_path.exists(), "test_config.json not found in tests/evals/"

    def test_config_has_criteria(self) -> None:
        config = json.loads((EVALS_DIR / "test_config.json").read_text(encoding="utf-8"))
        assert "criteria" in config, "test_config.json must have 'criteria' key"
        assert len(config["criteria"]) > 0, "criteria must not be empty"


class TestSydRubrics:
    """Verify custom SYD rubrics instantiate correctly (google-adk 1.26.0+)."""

    def test_rubric_imports(self) -> None:
        from tests.evals.syd_rubrics import (
            HAS_MQ_RUBRIC,
            INTENT_FIRST_RUBRIC,
            ITALIAN_ONLY_RUBRIC,
            NO_FURNITURE_RUBRIC,
            NO_ROUTING_IN_QUOTE_FLOW_RUBRIC,
            SKU_PRESENT_RUBRIC,
        )
        rubrics = [
            NO_FURNITURE_RUBRIC,
            ITALIAN_ONLY_RUBRIC,
            HAS_MQ_RUBRIC,
            SKU_PRESENT_RUBRIC,
            NO_ROUTING_IN_QUOTE_FLOW_RUBRIC,
            INTENT_FIRST_RUBRIC,
        ]
        for rubric in rubrics:
            assert rubric.rubric_id, "Rubric missing rubric_id"
            assert rubric.rubric_content, f"Rubric {rubric.rubric_id} missing rubric_content"

    def test_composite_metrics(self) -> None:
        from tests.evals.syd_rubrics import (
            SYD_INTENT_FIRST_QUALITY,
            SYD_QUOTE_QUALITY,
            SYD_TRIAGE_QUALITY,
        )
        metrics = [SYD_QUOTE_QUALITY, SYD_TRIAGE_QUALITY, SYD_INTENT_FIRST_QUALITY]
        for metric in metrics:
            assert metric.metric_name, "Metric missing metric_name"
            assert metric.criterion is not None, f"Metric {metric.metric_name} missing criterion"
            assert metric.criterion.threshold > 0, f"Metric {metric.metric_name} threshold must be > 0"


class TestAgentModule:
    """Verify agent module exposes root_agent for ADK eval compatibility."""

    def test_root_agent_exists(self) -> None:
        from src.adk.agents import root_agent
        assert root_agent is not None, "root_agent must be defined in src.adk.agents"
        assert root_agent.name == "syd_orchestrator"

    def test_sub_agents_present(self) -> None:
        from src.adk.agents import root_agent
        sub_agent_names = {a.name for a in root_agent.sub_agents}
        assert "triage" in sub_agent_names
        assert "design" in sub_agent_names
        assert "quote" in sub_agent_names


class TestRunEvalsExitCode:
    """run_evals.py must fail loudly: a swallowed error hides broken evals (issue #479)."""

    def test_main_exits_nonzero_when_evaluation_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from tests.evals import run_evals

        async def _boom(*_args: object, **_kwargs: object) -> None:
            raise ValueError("must contain a list of dictionaries")

        monkeypatch.setattr(run_evals, "run_all", _boom)
        monkeypatch.setattr("sys.argv", ["run_evals.py"])
        with pytest.raises(SystemExit) as exc:
            run_evals.main()
        assert exc.value.code == 1
