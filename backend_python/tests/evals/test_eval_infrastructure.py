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


class TestMultiRoomEval:
    """Phase 138: the multi-room set has its own agent module and in-memory backend."""

    MULTI_ROOM = EVALS_DIR / "multi_room" / "multi_room_flow.test.json"

    def test_loads_as_adk_eval_set_with_seeded_session(self) -> None:
        eval_set = EvalSet.model_validate_json(self.MULTI_ROOM.read_text(encoding="utf-8"))
        session = eval_set.eval_cases[0].session_input
        assert session is not None
        assert session.state["syd_active_room_id"] == "r_cucina"
        assert session.state["syd_session_context"]["is_guest"] is False

    def test_agent_module_exposes_the_production_app(self) -> None:
        """Same plugins as production (+ the reply recorder), the session block as
        the agents' instruction, compaction at the eval threshold."""
        from google.adk.apps.app import App
        from src.adk.app_factory import build_app
        from src.adk.session_context import session_context_instruction
        from tests.evals.multi_room import agent

        assert isinstance(agent.app, App)
        production = [p.name for p in build_app().plugins]
        assert [p.name for p in agent.app.plugins] == [*production, "eval_response_recorder"]
        assert agent.root_agent is agent.app.root_agent
        assert agent.root_agent.instruction is session_context_instruction
        compaction = agent.app.events_compaction_config
        assert compaction is not None and compaction.token_threshold == agent.EVAL_COMPACTION_TOKEN_THRESHOLD

    async def test_fake_backend_records_the_render_source(self) -> None:
        from src.adk import tools
        from tests.evals.multi_room.fakes import BATH_ROOM_ID, multi_room_backend, photo_url

        with multi_room_backend() as run:
            assert await tools._render_source_photo("p", BATH_ROOM_ID) == (photo_url("f_bagno_1"), "room_photo")
            # Without an active room the newest project photo (kitchen) would be used.
            source, _ = await tools._render_source_photo("p", None)
            await run.renders.render(source_image_url=source)
        assert run.renders.problems() == [
            f"render 1 started from {photo_url('f_cucina_2')!r}, expected {photo_url('f_bagno_1')!r}"
        ]


class TestMultiRoomLongChatEval:
    """Phase 138, PR-5: a chat past the compaction threshold still recalls the right room's facts."""

    LONG = EVALS_DIR / "multi_room" / "multi_room_long_chat.test.json"

    def test_loads_as_adk_eval_set_and_ends_with_the_recall_questions(self) -> None:
        case = EvalSet.model_validate_json(self.LONG.read_text(encoding="utf-8")).eval_cases[0]
        texts = [inv.user_content.parts[0].text for inv in case.conversation]
        assert len(texts) == 12
        assert all(t.startswith("###\n") for t in texts)
        assert "[Foto f_bagno_1 · Bagno]" in texts[0]
        assert "quanti mq di pavimento ha il bagno" in texts[-3]

    @staticmethod
    def _run(replies: list[str], summaries: list[str | None]):
        from types import SimpleNamespace

        from tests.evals.multi_room.fakes import CompactionRecorder, ResponseRecorder

        responses = ResponseRecorder()
        responses.texts = {f"inv{i}": [text] for i, text in enumerate(replies)}
        return SimpleNamespace(responses=responses, compactions=CompactionRecorder(summaries=summaries))

    def test_check_passes_when_the_facts_come_back_after_a_compaction(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run(
            ["...", "Il bagno ha 5 mq di pavimento; in cucina gres effetto rovere naturale.",
             "Nel corridoio 8 mq di parquet da levigare.",
             "La foto del bagno è f_bagno_1: avevi segnalato una macchia di umidità."],
            ["## Bagno\n- Misure: 5 mq"],
        )
        assert BACKEND_CHECKS["multi_room_long_chat.test.json"](run) == []

    def test_check_reports_a_missing_compaction_and_a_lost_fact(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run(
            ["Il bagno ha 6 mq; cucina in rovere.", "Corridoio: 8 mq di parquet.", "Foto f_bagno_1, umidità."],
            [None],
        )
        problems = BACKEND_CHECKS["multi_room_long_chat.test.json"](run)
        assert problems[0] == "the history was never compacted"
        assert len(problems) == 2 and "bathroom floor 5 mq" in problems[1]


class TestMultiRoomQuoteEval:
    """Phase 138, PR-3: the quote set runs the real suggest_quote_items on the in-memory backend."""

    QUOTE = EVALS_DIR / "multi_room" / "multi_room_quote.test.json"

    def test_loads_as_adk_eval_set_expecting_one_quote_call(self) -> None:
        eval_set = EvalSet.model_validate_json(self.QUOTE.read_text(encoding="utf-8"))
        case = eval_set.eval_cases[0]
        assert case.session_input is not None
        assert case.session_input.state["syd_session_context"]["phone_on_file"] is True
        expected = [t.name for inv in case.conversation for t in (inv.intermediate_data.tool_uses or [])]
        assert expected == ["suggest_quote_items"]

    def test_the_submit_set_sends_only_after_the_explicit_yes(self) -> None:
        """Phase 138, PR-4: "registra" saves the quote, the next turn's "sì, invia" sends it."""
        submit_set = EVALS_DIR / "multi_room" / "multi_room_submit.test.json"
        case = EvalSet.model_validate_json(submit_set.read_text(encoding="utf-8")).eval_cases[0]
        per_turn = [[t.name for t in (inv.intermediate_data.tool_uses or [])] for inv in case.conversation]
        assert per_turn == [[], [], ["suggest_quote_items"], ["submit_quote_request"]]
        assert "invia" in case.conversation[-1].user_content.parts[0].text

    async def test_the_submit_check_counts_submissions_after_a_saved_quote(self) -> None:
        from unittest.mock import MagicMock

        from src.adk import tools
        from tests.evals.multi_room.fakes import BACKEND_CHECKS, multi_room_backend

        context = MagicMock()
        context.session.id = "eval"
        with multi_room_backend() as run:
            reply = await tools.submit_quote_request(session_id="eval", tool_context=context)
        assert reply.startswith("✅")
        assert run.submissions.problems(expected=1) == ["submission 1 before any saved quote"]
        assert BACKEND_CHECKS["multi_room_quote.test.json"](run)[-1] == (
            "submit_quote_request called 1 times, expected 0"
        )

    def test_every_multi_room_set_has_a_backend_check(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        assert {p.name for p in (EVALS_DIR / "multi_room").glob("*.test.json")} == set(BACKEND_CHECKS)

    async def test_the_quote_runs_on_the_fakes_and_its_sections_are_checked(self) -> None:
        """The real tool on the fakes, with a stub InsightEngine: one quote, saved
        in memory only, a section per room and the common lines in Generale."""
        from unittest.mock import AsyncMock, patch

        from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion
        from src.tools.quote_tools import suggest_quote_items_wrapper
        from tests.evals.multi_room.fakes import multi_room_backend

        def s(sku: str, qty: float) -> SKUItemSuggestion:
            return SKUItemSuggestion(sku=sku, qty=qty, ai_reasoning="eval", phase="Lavori")

        async def analyze(chat_history, media_urls=None, *, session_id=None):
            bath = "Stanza da quotare: Bagno" in chat_history[0]["content"]
            lines = [s("BAG-SAN-001", 1), s("SMAL-001", 0.5)] if bath else [s("CUC-TOP-002", 3.5), s("SMAL-001", 0.3)]
            return InsightAnalysis(summary="ok", completeness_score=0.9, suggestions=lines)

        with multi_room_backend() as run, \
             patch("src.tools.quote_tools.get_insight_engine") as engine:
            engine.return_value.analyze_project_for_quote = AsyncMock(side_effect=analyze)
            reply = await suggest_quote_items_wrapper(session_id="eval", project_id="eval", user_id="u")

        assert "PRV-EVAL-0001" in reply
        assert run.quotes.problems() == []
        quote = run.quotes.quotes[0]
        assert {(i.sku, i.room_id) for i in quote.items} == {
            ("BAG-SAN-001", "r_bagno"), ("CUC-TOP-002", "r_cucina"), ("SMAL-001", "generale"),
        }

    def test_the_quote_check_flags_a_line_in_the_wrong_room(self) -> None:
        from src.schemas.quote import QuoteItem, QuoteRoom, QuoteSchema
        from tests.evals.multi_room.fakes import QuoteRecorder

        def line(sku: str, room_id: str) -> QuoteItem:
            return QuoteItem(sku=sku, description=sku, unit="cad", qty=1, unit_price=1, total=1, room_id=room_id)

        rooms = [QuoteRoom(room_id=r, room_label=r, room_type="altro") for r in ("r_bagno", "r_cucina")]
        quote = QuoteSchema(project_id="p", user_id="u", rooms=rooms,
                            items=[line("CUC-TOP-001", "r_bagno"), line("SMAL-001", "r_cucina")])
        assert QuoteRecorder(quotes=[quote]).problems() == [
            "kitchen line CUC-TOP-001 in r_bagno",
            "project-wide line SMAL-001 in r_cucina",
            "no common line (disposal, protection) in Generale",
        ]
