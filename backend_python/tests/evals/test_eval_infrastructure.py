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
from unittest.mock import MagicMock

import pytest
from google.adk.evaluation.eval_set import EvalSet
from google.genai import types
from src.core.exceptions import RoomNotFoundError
from src.services.card_event import CARD_CONFIRMED_TEXT

EVALS_DIR = Path(__file__).parent


class TestEvalSetParsing:
    """Verify all .test.json files parse into valid ADK EvalSet models."""

    @pytest.fixture
    def test_files(self) -> list[Path]:
        return list(EVALS_DIR.glob("*.test.json"))

    def test_test_files_exist(self, test_files: list[Path]) -> None:
        # The quote flow lives in the multi-room sets (in-memory backend); these two are the single-flow evals.
        assert {p.name for p in test_files} == {"triage_flow.test.json", "design_flow.test.json"}

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
        """Same plugins as production (+ the recorders), the session block as
        the agents' instruction, compaction at the eval threshold."""
        from google.adk.apps.app import App
        from src.adk.app_factory import build_app
        from src.adk.session_context import session_context_instruction
        from tests.evals.multi_room import agent

        assert isinstance(agent.app, App)
        production = [p.name for p in build_app().plugins]
        recorders = ["eval_response_recorder", "eval_tool_call_recorder", "eval_instruction_recorder"]
        assert [p.name for p in agent.app.plugins] == [*production, *recorders]
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


class TestFloorAreaAskedEval:
    """18 Nov test chat: a bedroom without its size gets one floor-area question, no quote yet."""

    SET = EVALS_DIR / "multi_room" / "floor_area_asked.test.json"

    ASKED = "Ottimo. Più o meno quanti metri quadri è la camera?"
    ESTIMATED = "Nessun problema: userò una stima da correggere nella scheda. Preparo la richiesta di preventivo?"

    @staticmethod
    def _run(replies: list[str], tools: list[list[str]]):
        from types import SimpleNamespace

        from tests.evals.multi_room.fakes import ResponseRecorder

        responses = ResponseRecorder()
        responses.texts = {f"inv{i}": [reply] for i, reply in enumerate(replies)}
        return SimpleNamespace(
            responses=responses,
            tool_calls=SimpleNamespace(turns=lambda: [[(f"inv{i}", t) for t in turn] for i, turn in enumerate(tools)]),
            submissions=SimpleNamespace(problems=lambda expected: []),
        )

    def test_loads_without_a_size_or_a_request_to_prepare(self) -> None:
        case = EvalSet.model_validate_json(self.SET.read_text(encoding="utf-8")).eval_cases[0]
        text = case.conversation[0].user_content.parts[0].text.lower()
        assert "camera" in text and "mq" not in text and "metri" not in text and "prepara" not in text
        assert "non lo so" in case.conversation[1].user_content.parts[0].text.lower()

    def test_check_passes_on_one_question_then_the_estimate(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run([self.ASKED, self.ESTIMATED], [["select_room"], []])
        assert BACKEND_CHECKS["floor_area_asked.test.json"](run) == []

    def test_check_reports_the_tool_called_without_asking(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run(["Preparo la richiesta.", self.ESTIMATED], [["select_room", "suggest_quote_items"], []])
        problems = BACKEND_CHECKS["floor_area_asked.test.json"](run)
        assert len(problems) == 2 and "before the floor area" in problems[0] and "turn 1" in problems[1]

    def test_check_reports_a_wall_question_and_the_area_asked_twice(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run(["Quanti mq di pareti vuoi dipingere?", "Mi dici almeno i metri quadri della camera?"], [[], []])
        problems = BACKEND_CHECKS["floor_area_asked.test.json"](run)
        assert [p.split(":")[0] for p in problems] == [
            "turn 1 does not ask the floor area", "turn 2 asks the floor area again",
            "turn 2 does not say the area will be estimated",
        ]


class TestCardConfirmedEval:
    """PR 2 of the card fixes: the hidden signal after the last confirmation goes to the send question."""

    SET = EVALS_DIR / "multi_room" / "card_confirmed.test.json"

    ASKS = "Bagno: rifacimento completo. Invio al nostro team la richiesta di preventivo per Bagno. Confermi?"

    @staticmethod
    def _run(replies: list[str], tools: list[list[str]]):
        from types import SimpleNamespace

        from tests.evals.multi_room.fakes import ResponseRecorder

        responses = ResponseRecorder()
        responses.texts = {f"inv{i}": [reply] for i, reply in enumerate(replies)}
        return SimpleNamespace(
            responses=responses,
            tool_calls=SimpleNamespace(turns=lambda: [[(f"inv{i}", t) for t in turn] for i, turn in enumerate(tools)]),
            submissions=SimpleNamespace(problems=lambda expected: [] if expected == 0 else ["sent"]),
        )

    def test_the_set_seeds_the_signal_and_a_closed_card(self) -> None:
        case = json.loads(self.SET.read_text(encoding="utf-8"))["eval_cases"][0]
        state = case["session_input"]["state"]
        assert state["syd_card_event"] == "card_confirmed" and state["syd_card_pending"] is False
        assert state["syd_house_quote"]["status"] == "draft"
        words = case["conversation"][0]["user_content"]["parts"][0]["text"]
        assert CARD_CONFIRMED_TEXT in words  # the words the backend gives the agent

    def test_check_passes_on_the_send_question_without_a_tool(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        assert BACKEND_CHECKS["card_confirmed.test.json"](self._run([self.ASKS], [[]])) == []

    def test_check_reports_a_tool_and_a_missing_question(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run(["Ho registrato tutto, grazie."], [["suggest_quote_items"]])
        problems = BACKEND_CHECKS["card_confirmed.test.json"](run)
        assert len(problems) == 2
        assert "suggest_quote_items" in problems[0] and "send question" in problems[1]


class TestSingleFlowEvals:
    """The triage and design flows check the routing, as the only criterion that is stable.

    They run the real agents without the in-memory backend (no Firestore, no real photo), so what
    they can say is who the router hands the turn to. A word-overlap score against a hand-written
    reply says nothing about generated text and was dropped; the multi-room sets check the replies."""

    @staticmethod
    def _routes(name: str) -> dict[str, list[list[tuple[str, dict]]]]:
        eval_set = EvalSet.model_validate_json((EVALS_DIR / name).read_text(encoding="utf-8"))
        return {
            case.eval_id: [
                [(call.name, call.args) for call in (inv.intermediate_data.tool_uses if inv.intermediate_data else [])]
                for inv in case.conversation
            ]
            for case in eval_set.eval_cases
        }

    def test_the_criteria_are_the_tool_trajectory_only(self) -> None:
        criteria = json.loads((EVALS_DIR / "test_config.json").read_text(encoding="utf-8"))["criteria"]
        assert set(criteria) == {"tool_trajectory_avg_score"}
        assert criteria["tool_trajectory_avg_score"]["matchType"] == "IN_ORDER"

    def test_the_quote_flow_case_says_it_covers_the_hand_off_only(self) -> None:
        """The old case checked that the triage reply does not ask "Come vuoi procedere?" inside a quote
        (syd_rubrics.NO_ROUTING_IN_QUOTE_FLOW_RUBRIC). Without an attached image and a judge that is not
        covered, and the description must not suggest it is."""
        description = json.loads((EVALS_DIR / "triage_flow.test.json").read_text(encoding="utf-8"))["description"]
        assert "not covered" in description.lower() and "Come vuoi procedere" in description

    def test_triage_routes_a_photo_to_the_triage_agent_also_inside_a_quote(self) -> None:
        # triage's description: photos "quando è già in corso un preventivo o solo un'analisi della stanza".
        to = lambda agent: ("transfer_to_agent", {"agent_name": agent})  # noqa: E731
        assert self._routes("triage_flow.test.json") == {
            "photo_mentioned_without_attachment": [[to("triage")]],
            "photo_in_quote_flow": [[to("quote")], [to("triage")]],
        }

    def test_design_routes_a_render_request_to_the_design_agent(self) -> None:
        assert self._routes("design_flow.test.json") == {
            "design_livingroom_modern": [[("transfer_to_agent", {"agent_name": "design"})]],
        }

    @pytest.mark.parametrize("name", ["triage_flow.test.json", "design_flow.test.json"])
    def test_no_turn_is_left_without_an_expected_tool(self, name: str) -> None:
        """An empty expectation makes the trajectory score pass whatever the agent does."""
        for case_id, turns in self._routes(name).items():
            assert all(turns), f"{name} {case_id}: a turn expects no tool call"


class TestSingleFlowAgentModule:
    """google-adk 2.x loads an eval agent only from a module named `.agent` (or with an `agent`
    member): the quote, triage and design flows failed to load before any model call."""

    def test_the_module_is_one_adk_can_load_and_exposes_the_production_agents(self) -> None:
        import importlib

        from src.adk.agents import root_agent
        from tests.evals import run_evals

        assert run_evals.AGENT_MODULE.endswith(".agent")
        assert importlib.import_module(run_evals.AGENT_MODULE).root_agent is root_agent


class TestRoomPlaybookEvals:
    """Strada B PR C: the bathroom checklist comes from the room playbook (dynamic instruction),
    not from the static prompt. What is checked is that it reaches the quote agent (the model
    then asks one category per turn, as the prompt says); the open space of a project with a
    bathroom does not get it."""

    DIR = EVALS_DIR / "multi_room"
    MARKER = "CHECKLIST TECNICA — BAGNO"
    ASKS = "Certo! Il bagno va rifatto tutto o solo in parte? Quanti metri quadri è?"

    @classmethod
    def _run(cls, replies: list[str], tools: list[list[str]], seen: list[tuple[str, str]]):
        from types import SimpleNamespace

        from tests.evals.multi_room.fakes import InstructionRecorder, ResponseRecorder

        responses = ResponseRecorder()
        responses.texts = {f"inv{i}": [reply] for i, reply in enumerate(replies)}
        instructions = InstructionRecorder()
        instructions.requests = list(seen)
        calls = [[("quote", t) for t in turn] for turn in tools]
        return SimpleNamespace(
            responses=responses,
            tool_calls=SimpleNamespace(turns=lambda: calls),
            instructions=instructions,
            submissions=SimpleNamespace(problems=lambda expected: []),
        )

    @pytest.mark.parametrize("name", ["bathroom_checklist", "guest_bathroom_checklist", "open_space_with_bathroom"])
    def test_the_sets_load_and_start_with_one_vague_request(self, name: str) -> None:
        sets = EvalSet.model_validate_json((self.DIR / f"{name}.test.json").read_text(encoding="utf-8"))
        assert len(sets.eval_cases) == 1 and len(sets.eval_cases[0].conversation) == 1

    def test_the_bathroom_sets_do_not_name_the_checklist_points(self) -> None:
        for name in ("bathroom_checklist", "guest_bathroom_checklist"):
            case = EvalSet.model_validate_json((self.DIR / f"{name}.test.json").read_text(encoding="utf-8")).eval_cases[0]
            text = case.conversation[0].user_content.parts[0].text.lower()
            assert "bagno" in text
            assert not any(w in text for w in ("doccia", "vasca", "piastrell", "sanitari", "mq", "metri"))

    def test_the_guest_set_is_a_guest_and_the_others_are_registered(self) -> None:
        from tests.evals.multi_room.fakes import GUEST_SETS

        assert "guest_bathroom_checklist.test.json" in GUEST_SETS
        assert "bathroom_checklist.test.json" not in GUEST_SETS

    def test_the_open_space_set_has_a_bathroom_in_the_index_and_the_kitchen_active(self) -> None:
        case = EvalSet.model_validate_json((self.DIR / "open_space_with_bathroom.test.json").read_text(encoding="utf-8")).eval_cases[0]
        state = case.session_input.state
        assert {r["room_type"] for r in state["syd_rooms"]} == {"cucina", "bagno"}
        assert state["syd_active_room_id"] == "r_cucina"

    def test_the_bathroom_check_passes_when_the_checklist_reached_the_quote_agent(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run([self.ASKS], [["select_room"]], [("quote", f"## {self.MARKER} (guida)")])
        assert BACKEND_CHECKS["bathroom_checklist.test.json"](run) == []

    def test_the_bathroom_check_reports_the_quote_before_it_and_a_checklist_that_never_came(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run(["Preparo la richiesta."], [["select_room", "suggest_quote_items"]], [("quote", "niente")])
        problems = BACKEND_CHECKS["bathroom_checklist.test.json"](run)
        assert [p.split(" ")[0] for p in problems] == ["suggest_quote_items", "the", "the"]
        assert "never reached the quote agent" in problems[1] and "asks nothing" in problems[2]

    def test_a_checklist_seen_by_another_agent_does_not_count(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        run = self._run([self.ASKS], [[]], [("triage", self.MARKER)])
        assert any("never reached" in p for p in BACKEND_CHECKS["bathroom_checklist.test.json"](run))

    def test_the_guest_check_wants_the_checklist_and_no_login_yet(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        seen = [("quote", self.MARKER)]
        assert BACKEND_CHECKS["guest_bathroom_checklist.test.json"](self._run([self.ASKS], [["select_room"]], seen)) == []
        problems = BACKEND_CHECKS["guest_bathroom_checklist.test.json"](
            self._run([self.ASKS], [["select_room", "request_login"]], [("quote", "niente")])
        )
        assert any("login requests" in p for p in problems) and any("never reached" in p for p in problems)

    def test_the_open_space_check_flags_a_checklist_that_reached_an_agent(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        check = BACKEND_CHECKS["open_space_with_bathroom.test.json"]
        assert check(self._run([self.ASKS], [[]], [("quote", "contesto senza guida")])) == []
        problems = check(self._run([self.ASKS], [[]], [("quote", f"## {self.MARKER}")]))
        assert len(problems) == 1 and "quote" in problems[0]

    async def test_the_recorder_reads_the_dynamic_instruction_not_the_static_prompt(self) -> None:
        """The static prompt names the checklist («CHECKLIST TECNICA — BAGNO», the pointer sentence of
        modes.py), so a marker in the system instruction proves nothing: only the contents count."""
        from types import SimpleNamespace

        from google.adk.models.llm_request import LlmRequest
        from tests.evals.multi_room.fakes import InstructionRecorder

        recorder = InstructionRecorder()
        request = LlmRequest(
            contents=[types.Content(role="user", parts=[types.Part(text=f"blocco ## {self.MARKER}")])],
            config=types.GenerateContentConfig(system_instruction="prompt statico"),
        )
        await recorder.before_model_callback(callback_context=SimpleNamespace(agent_name="quote"), llm_request=request)
        static_only = LlmRequest(config=types.GenerateContentConfig(system_instruction=f"{self.MARKER} nel prefisso"))
        await recorder.before_model_callback(callback_context=SimpleNamespace(agent_name="design"), llm_request=static_only)
        assert recorder.agents_with(self.MARKER) == {"quote"}
        assert recorder.agents_with("assente") == set()
        recorder.reset()
        assert recorder.agents_with(self.MARKER) == set()

    def test_the_quote_static_prompt_points_to_the_checklist_by_its_title(self) -> None:
        """Why the recorder must skip the system instruction: the title is in the static prompt too."""
        from src.adk.agents import quote_agent

        assert self.MARKER in str(quote_agent.static_instruction)

    async def test_the_fake_repository_renames_a_room_like_the_real_one(self) -> None:
        from src.schemas.room import RoomUpdate
        from tests.evals.multi_room.fakes import FakeRoomRepository

        repo = FakeRoomRepository()
        room = await repo.update_room("p", "r_cucina", RoomUpdate(label="Open space"))
        assert room.label == "Open space" and room.room_type == "cucina"
        assert [r.label for r in await repo.list_rooms("p")] == ["Open space", "Bagno"]
        with pytest.raises(RoomNotFoundError):
            await repo.update_room("p", "r_nope", RoomUpdate(label="X"))


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
        from tests.unit.send_consent_fakes import give_send_consent

        context = give_send_consent(MagicMock())
        context.session.id = "eval"
        with multi_room_backend() as run:
            reply = await tools.submit_quote_request(session_id="eval", tool_context=context)
        assert reply.startswith("✅")
        assert run.submissions.problems(expected=1) == ["submission 1 before any saved quote"]
        assert BACKEND_CHECKS["multi_room_quote.test.json"](run)[-1] == (
            "submit_quote_request called 1 times, expected 0"
        )

    async def test_the_revision_and_relay_checks_follow_the_house_quote(self) -> None:
        """Phase 139 PR-3: a sent quote is revised, a quote with the team is relayed (fakes only)."""
        from tests.evals.multi_room.fakes import BACKEND_CHECKS, multi_room_backend

        with multi_room_backend("quote_revision.test.json") as run:
            saved = await run.quotes.save(None, "eval", _eval_quote(), _eval_request())
            assert await run.quotes.relay(None, "eval") is None
        assert (saved.outcome.value, saved.quote_number, saved.version) == ("revised", "PRV-EVAL-0001", 4)
        assert BACKEND_CHECKS["quote_revision.test.json"](run) == ["submit_quote_request called 0 times, expected 1"]

        with multi_room_backend("quote_with_team.test.json") as run:
            relayed = await run.quotes.relay(None, "eval", proposal=MagicMock())
        assert relayed is not None and relayed.status == "in_review"
        assert BACKEND_CHECKS["quote_with_team.test.json"](run) == []

        # Without a proposal: right only while the reply asks the missing data.
        with multi_room_backend("quote_with_team.test.json") as run:
            await run.quotes.relay(None, "eval")
            run.responses.texts = {"inv": ["Ho segnalato al team la tua richiesta."]}
        assert BACKEND_CHECKS["quote_with_team.test.json"](run) == [
            "relayed without an AI proposal and the reply asks nothing: 'Ho segnalato al team la tua richiesta.'"
        ]

        with multi_room_backend("quote_with_team.test.json") as run:
            await run.quotes.relay(None, "eval")
            run.responses.texts = {"inv": ["Ho segnalato al team la richiesta. Quanti mq è il bagno?"]}
        assert BACKEND_CHECKS["quote_with_team.test.json"](run) == []

    async def test_the_room_photo_vision_never_runs_in_an_eval(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """select_room would start it in the background on the real Firestore (PR 2)."""
        from src.core.config import settings
        from src.services.room_photo_vision import schedule_room_vision
        from tests.evals.multi_room.fakes import multi_room_backend

        monkeypatch.setattr(settings, "ROOM_VISION_ENABLED", True)
        with multi_room_backend():
            task = schedule_room_vision("eval", "bagno1")
        if task is not None:
            task.cancel()
        assert task is None

    async def test_the_tool_replies_are_recorded_for_the_log(self) -> None:
        """What a tool told the model: the reply can then be compared with it."""
        from types import SimpleNamespace

        from tests.evals.multi_room.fakes import ToolCallRecorder

        calls = ToolCallRecorder()
        context = SimpleNamespace(invocation_id="inv1", agent_name="quote")
        await calls.after_tool_callback(
            tool=SimpleNamespace(name="suggest_quote_items"), tool_args={}, tool_context=context,
            result={"result": "Quanti mq è il bagno?\n\nIntanto ho segnalato al team la tua richiesta."},
        )
        # transfer_to_agent returns None
        await calls.after_tool_callback(
            tool=SimpleNamespace(name="transfer_to_agent"), tool_args={}, tool_context=context, result=None,
        )
        assert calls.result_report() == [
            "turn 1: quote.suggest_quote_items → 'Quanti mq è il bagno?\\n\\nIntanto ho segnalato al team la tua richiesta.'",
            "turn 1: quote.transfer_to_agent → None",
        ]

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
            context = chat_history[0]["content"]
            if "Sezione da quotare: Generale" in context:  # the rest of the home: common protection only
                lines = [s("SC-002", 1)]
            elif "Stanza da quotare: Bagno" in context:
                lines = [s("BAG-SAN-001", 1), s("SMAL-001", 0.5)]
            else:
                lines = [s("CUC-TOP-002", 3.5), s("SMAL-001", 0.3)]
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
            ("SC-002", "generale"),
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


class TestLoginAndGeneraleEvals:
    """Phase 138 PR-6: guest sets (login only at the confirmation), a registered
    user (never a login) and the "Generale" quote (a corridor never created)."""

    MULTI_ROOM = EVALS_DIR / "multi_room"

    def _per_turn(self, name: str) -> list[list[str]]:
        case = EvalSet.model_validate_json((self.MULTI_ROOM / name).read_text(encoding="utf-8")).eval_cases[0]
        return [[t.name for t in (inv.intermediate_data.tool_uses or [])] for inv in case.conversation]

    @pytest.mark.parametrize("name", ["guest_quote.test.json", "guest_render.test.json"])
    def test_guest_sets_expect_the_login_only_in_the_confirmation_turn(self, name: str) -> None:
        per_turn = self._per_turn(name)
        assert per_turn[-1] == ["request_login"] and not any(per_turn[:-1])
        state = EvalSet.model_validate_json((self.MULTI_ROOM / name).read_text(encoding="utf-8")) \
            .eval_cases[0].session_input.state  # pyright: ignore[reportOptionalMemberAccess]
        assert state["syd_session_context"]["is_guest"] is True

    def test_the_registered_set_is_the_guest_chat_without_a_login(self) -> None:
        assert self._per_turn("logged_in_quote.test.json") == [[], [], ["suggest_quote_items"]]

    def _run(self, calls: dict[str, list[tuple[str, str]]]):
        from tests.evals.multi_room.fakes import TOOL_CALLS, multi_room_backend

        with multi_room_backend("guest_quote.test.json") as run:
            TOOL_CALLS.calls = calls
        return run

    def test_the_guest_check_counts_logins_per_turn_and_premium_tools(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        early = self._run({"t1": [("syd_orchestrator", "request_login")], "t2": [],
                           "t3": [("quote", "request_login"), ("quote", "request_login")]})
        assert BACKEND_CHECKS["guest_quote.test.json"](early) == [
            "turn 1: 1 login requests, expected 0", "turn 3: 2 login requests, expected 1",
        ]
        premium = self._run({"t1": [], "t2": [("quote", "request_login"), ("quote", "suggest_quote_items")]})
        assert BACKEND_CHECKS["guest_quote.test.json"](premium) == ["turn 2: guest called quote.suggest_quote_items"]
        right = self._run({"t1": [("syd_orchestrator", "transfer_to_agent")], "t2": [("quote", "request_login")]})
        assert BACKEND_CHECKS["guest_quote.test.json"](right) == []

    async def test_guest_sets_get_a_guest_gate_and_their_own_quote_history(self) -> None:
        from unittest.mock import MagicMock

        from src.adk import tools
        from src.tools import quote_tools
        from tests.evals.multi_room.fakes import BATH_ONLY_HISTORY, GENERAL_HISTORY, multi_room_backend

        with multi_room_backend("guest_render.test.json"):
            assert await tools._is_guest(MagicMock()) is True
        with multi_room_backend("logged_in_quote.test.json"):
            assert await tools._is_guest(MagicMock()) is False
            assert await quote_tools.ConversationRepository().get_context("s", limit=50) == BATH_ONLY_HISTORY
        with multi_room_backend("multi_room_general.test.json"):
            assert await quote_tools.ConversationRepository().get_context("s", limit=50) == GENERAL_HISTORY

    async def test_the_generale_check_wants_the_corridor_once_in_generale(self) -> None:
        from unittest.mock import AsyncMock, patch

        from src.services.insight_engine import InsightAnalysis, SKUItemSuggestion
        from src.tools.quote_tools import suggest_quote_items_wrapper
        from tests.evals.multi_room.fakes import BACKEND_CHECKS, multi_room_backend

        def s(sku: str, qty: float, why: str = "eval") -> SKUItemSuggestion:
            return SKUItemSuggestion(sku=sku, qty=qty, ai_reasoning=why, phase="Lavori")

        async def analyze(chat_history, media_urls=None, *, session_id=None):
            context = chat_history[0]["content"]
            if "Sezione da quotare: Generale" in context:
                lines = [s("PAV-002", 8, "Parquet nel corridoio"), s("SC-002", 1)]
            elif "Stanza da quotare: Bagno" in context:
                lines = [s("BAG-SAN-001", 1), s("SMAL-001", 0.5)]
            else:
                lines = [s("CUC-TOP-002", 3.5), s("SMAL-001", 0.3)]
            return InsightAnalysis(summary="ok", completeness_score=0.9, suggestions=lines)

        with multi_room_backend("multi_room_general.test.json") as run, \
             patch("src.tools.quote_tools.get_insight_engine") as engine:
            engine.return_value.analyze_project_for_quote = AsyncMock(side_effect=analyze)
            await suggest_quote_items_wrapper(session_id="eval", project_id="eval", user_id="u")

        assert BACKEND_CHECKS["multi_room_general.test.json"](run) == []
        items = run.quotes.quotes[0].items
        parquet = next(n for n, i in enumerate(items) if i.sku == "PAV-002")
        items[parquet] = items[parquet].model_copy(update={"room_id": "r_bagno"})  # the corridor counted in a room
        assert "corridor line PAV-002 in r_bagno" in run.quotes.general_problems()


def _eval_quote():
    from src.schemas.quote import QuoteSchema

    return QuoteSchema(project_id="eval", user_id="eval-user")


def _eval_request():
    from src.schemas.quote import QuoteRequest

    return QuoteRequest(summary="Porta e termoarredo", channel="chat", session_id="eval")


class TestCompanyInfoEval:
    """Phase 141, PR-2: company questions answered from the company info, never a login."""

    COMPANY = EVALS_DIR / "multi_room" / "company_info.test.json"
    GOOD_REPLIES = [
        "Puoi chiamarci al +39 375 5463599 o scrivere a sydbioedilizia@gmail.com.",
        "SYD opera a Roma e provincia: in base alle informazioni che ho, Viterbo non rientra nella zona servita.",
        "Sì, Velletri rientra nella zona servita.",
        "Questa lavorazione non è indicata come attività svolta da SYD.",
        "Il sopralluogo è gratuito e si richiede dopo il preventivo.",
        "Su questo non ho informazioni nella scheda di SYD.",
        "Questa lavorazione non è indicata come attività svolta da SYD.",
    ]
    GOOD_TOOLS: list[list[str]] = [[], ["check_service_area"], ["check_service_area"], [], [], ["get_company_info"], []]

    @staticmethod
    def _run(replies: list[str], tools: list[list[str]]):
        from types import SimpleNamespace

        from tests.evals.multi_room.fakes import ResponseRecorder, ToolCallRecorder

        responses, calls = ResponseRecorder(), ToolCallRecorder()
        responses.texts = {f"inv{i}": [text] for i, text in enumerate(replies)}
        calls.calls = {f"inv{i}": [("syd_orchestrator", t) for t in names] for i, names in enumerate(tools)}
        return SimpleNamespace(responses=responses, tool_calls=calls)

    def test_the_set_is_a_guest_set_with_seven_turns(self) -> None:
        from tests.evals.multi_room.fakes import GUEST_SETS

        assert self.COMPANY.name in GUEST_SETS
        case = EvalSet.model_validate_json(self.COMPANY.read_text(encoding="utf-8")).eval_cases[0]
        assert len(case.conversation) == 7
        assert case.session_input is not None and case.session_input.state["syd_session_context"]["is_guest"]

    def test_check_passes_on_replies_from_the_company_info(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        assert BACKEND_CHECKS[self.COMPANY.name](self._run(self.GOOD_REPLIES, self.GOOD_TOOLS)) == []

    def test_check_names_the_turns_that_guessed(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        replies = list(self.GOOD_REPLIES)
        replies[3] = "Sì, facciamo anche piscine!"
        tools = [list(t) for t in self.GOOD_TOOLS]
        tools[1] = []
        problems = BACKEND_CHECKS[self.COMPANY.name](self._run(replies, tools))
        assert len(problems) == 2
        assert "turn 2" in problems[0] and "check_service_area" in problems[0]
        assert "turn 4" in problems[1]

    def test_check_reports_a_login_request(self) -> None:
        from tests.evals.multi_room.fakes import BACKEND_CHECKS

        tools = [list(t) for t in self.GOOD_TOOLS]
        tools[6] = ["request_login"]
        problems = BACKEND_CHECKS[self.COMPANY.name](self._run(self.GOOD_REPLIES, tools))
        assert problems == ["turn 7: 1 login requests, expected 0"]
