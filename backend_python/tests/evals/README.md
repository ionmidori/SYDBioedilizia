# ADK evaluation suite

This folder holds the evaluations of the SYD agents, run with the native
`AgentEvaluator` of Google ADK. Each evaluation replays a scripted conversation
against the real agents and compares the tool calls and the answer with what's
expected. The runs call the live Gemini API, so they aren't part of the normal
test suite or of CI.

## Run the evaluations

You need a Gemini backend and the ADK eval dependencies:

- **Backend**: a valid `GOOGLE_API_KEY` in `backend_python/.env` (AI Studio), or
  Vertex AI with your gcloud credentials (`gcloud auth application-default login`).
  For Vertex, set the variables for the run only and blank the keys, so an
  inactive key in `.env` is not used:
  `GOOGLE_GENAI_USE_VERTEXAI=true GOOGLE_CLOUD_PROJECT=<project> GOOGLE_CLOUD_LOCATION=eu GOOGLE_API_KEY= GEMINI_API_KEY= npm run eval:run:rooms`
- **Dependencies**: none to install by hand. The `npm run eval:run*` scripts go through
  `scripts/run-evals.mjs`, which keeps an own environment (`backend_python/.venv-eval`,
  Python 3.14) with the locked dependencies plus the ADK eval extra (not in the lock
  file). The extra cannot be installed on Python 3.15: litellm needs fastuuid, which
  has no 3.15 wheels.

```bash
npm run eval:run              # from the repo root: all flows
npm run eval:run:triage       # one flow
npm run eval:run:design
npm run eval:run:rooms        # multi-room chat (Phase 138)
```

To use more options, run the runner directly from `backend_python/`:

```bash
uv run python tests/evals/run_evals.py \
  --file triage_flow.test.json \
  --agent triage \
  --runs 3 \
  --output results/
```

| Option | Meaning |
| :--- | :--- |
| `--file`, `-f` | One `.test.json` file from this folder (default: all) |
| `--agent`, `-a` | Sub-agent to evaluate: `triage`, `design` or `quote` (default: the root agent) |
| `--runs`, `-n` | Runs per case, to see the variance (default: 1) |
| `--output`, `-o` | Folder for the JSON results, relative to this folder |

The runner exits with a non-zero code on any error: an invalid eval file, an
API failure or a metric below its threshold. A zero exit code means every case
passed. Results saved with `--output` are timestamped JSON files in
`results/` and aren't tracked by git.

## Eval sets

| File | Cases |
| :--- | :--- |
| `triage_flow.test.json` | `photo_mentioned_without_attachment`, `photo_in_quote_flow` (routing only) |
| `design_flow.test.json` | `design_livingroom_modern` (routing only) |
| `multi_room/multi_room_flow.test.json` | `bathroom_render_after_kitchen_photo` |
| `multi_room/multi_room_quote.test.json` | `bathroom_and_kitchen_quote` |
| `multi_room/multi_room_submit.test.json` | `bathroom_and_kitchen_quote_then_explicit_yes` |
| `multi_room/multi_room_general.test.json` | `bathroom_kitchen_and_corridor` |
| `multi_room/multi_room_long_chat.test.json` | `long_multi_room_recall` |
| `multi_room/logged_in_quote.test.json` | `registered_bathroom_quote` |
| `multi_room/guest_quote.test.json` | `guest_bathroom_quote` |
| `multi_room/guest_render.test.json` | `guest_living_room_render` |
| `multi_room/guest_price.test.json` | `guest_window_price` |
| `multi_room/quote_revision.test.json` | `sent_quote_new_request` |
| `multi_room/quote_with_team.test.json` | `in_review_quote_change` |
| `multi_room/company_info.test.json` | `guest_company_questions` |
| `multi_room/measures_on_card.test.json` | `bathroom_without_measures` |
| `multi_room/room_correction.test.json` | `bathroom_floor_corrected_untagged` |
| `multi_room/floor_area_asked.test.json` | `bedroom_without_floor_area` |
| `multi_room/bathroom_checklist.test.json` | `bathroom_checklist` (room playbook reaches the quote agent) |
| `multi_room/guest_bathroom_checklist.test.json` | `guest_bathroom_checklist` (a guest has no rooms: same checklist) |
| `multi_room/open_space_with_bathroom.test.json` | `open_space_with_bathroom` (no bathroom checklist for another room) |

The files use the ADK `EvalSet` schema, which **requires snake_case keys**:

```json
{
  "eval_set_id": "syd_quote_flow_v1",
  "name": "SYD Quote Flow Scenarios",
  "eval_cases": [
    {
      "eval_id": "quote_bathroom_6mq",
      "conversation": [
        {
          "invocation_id": "inv_quote_001",
          "user_content": { "parts": [{ "text": "Vorrei ristrutturare il mio bagno." }], "role": "user" },
          "final_response": { "parts": [{ "text": "expected answer" }], "role": "model" },
          "intermediate_data": {
            "tool_uses": [{ "name": "suggest_quote_items", "args": {}, "id": "call_001" }]
          }
        }
      ]
    }
  ]
}
```

With camelCase keys (`evalSetId`, `userContent`) the installed `google-adk`
fails validation, falls back to its legacy loader and stops with
`must contain a list of dictionaries`. `test_eval_infrastructure.py` loads every
file with `EvalSet` and runs without network access, so a schema problem fails
the normal test suite instead of the live run.

To add a case or a flow, create or edit a `.test.json` file in this folder and
run it with `--file`. Add a flow script to the root `package.json` if you want
a shortcut.

## Multi-room set (Phase 138)

`multi_room/` checks one chat for the whole home: kitchen and bathroom photos
alternate (as the orchestrator labels them, `[Foto <id> · <stanza>]`), the
kitchen is the active room, then the user asks for a bathroom render. It runs
differently from the other sets:

- **Agent module** `tests.evals.multi_room.agent`: the production `App`
  (`src/adk/app_factory.py`: plugins, history compaction), so the model reads
  "CONTESTO SESSIONE" (login, STANZE DEL PROGETTO, STANZA ATTIVA) as in
  production. The case seeds that state with `session_input.state`. The
  compaction threshold is lowered to 10k tokens so the long-chat set reaches it.
- **Long chat** (`multi_room_long_chat.test.json`, Phase 138 PR-5): 12 turns over
  bathroom, kitchen, the whole home and a room never created; the runner fails
  unless the history was compacted at least once and the last three replies
  still carry the right room's facts (bathroom floor 5 mq, kitchen oak-effect
  tiles, corridor 8 mq of parquet, bathroom photo `f_bagno_1` and its damp stain).
- **Token report**: every multi-room run logs the prompt and cached tokens of
  each model call, turn by turn (`… tokens turn N: <agent> prompt=… cached=…`).
- **In-memory backend** (`multi_room/fakes.py`): rooms, project files, login,
  quota and the image backend are fakes. The run writes nothing to Firestore or
  Storage and spends no render quota.
- **Render source check**: the runner fails unless at least one render was
  generated and every render started from the bathroom photo (`f_bagno_1`),
  not from the newest project photo (`f_cucina_2`).
- **Own criteria** (`multi_room/test_config.json`): tool trajectory `IN_ORDER`
  with `ignoreArgs` (`select_room` in the render turn), no response match.

## Pass criteria

`test_config.json` defines what the runner checks for every case:

| Criterion | Value | Meaning |
| :--- | :--- | :--- |
| `tool_trajectory_avg_score` | 1.0, `IN_ORDER` | The expected tools must be called in that order; extra calls are allowed |

The triage and design flows run the real agents with no backend and no attached image, so they check
the router's hand-off only: a word-overlap score against a hand-written reply says nothing about
generated text (`response_match_score` was dropped). The replies of the multi-room sets are checked
by their backend checks (`multi_room/fakes.py`). Edit `test_config.json` to change the threshold.

## Rubrics

`syd_rubrics.py` defines LLM-as-judge rubrics for the SYD business rules and
three composite metrics:

| Rubric | Rule |
| :--- | :--- |
| `NO_FURNITURE_RUBRIC` | Quotes never include furniture as a line item |
| `ITALIAN_ONLY_RUBRIC` | Every answer is in Italian |
| `HAS_MQ_RUBRIC` | Quote items carry quantities in square meters |
| `SKU_PRESENT_RUBRIC` | Quote items reference price book SKUs |
| `NO_ROUTING_IN_QUOTE_FLOW_RUBRIC` | Triage doesn't ask the routing question again inside a quote flow |
| `INTENT_FIRST_RUBRIC` | A file upload without context first triggers the intent question |

| Metric | Rubrics | Threshold |
| :--- | :--- | :--- |
| `SYD_QUOTE_QUALITY` | no furniture, Italian, square meters, SKU | 0.7 |
| `SYD_TRIAGE_QUALITY` | Italian, no routing in quote flow | 0.8 |
| `SYD_INTENT_FIRST_QUALITY` | intent first, Italian | 0.8 |

The judge model is the one resolved for the `INSIGHT` role (`MODEL_INSIGHT`,
which falls back to `CHAT_MODEL_VERSION`), with 3 samples per rubric.

> **Note:** The rubric metrics are defined and tested, but `run_evals.py` and
> `test_config.json` don't use them yet: a run checks only the criteria in the
> previous section. Wiring them in means adding them to the evaluation
> criteria of the runner.

To add a rubric, define a `Rubric` in `syd_rubrics.py` and include it in a
metric:

```python
CUSTOM_RUBRIC = Rubric(
    rubric_id="custom_check",
    rubric_content=RubricContent(text_property="The response does X."),
    description="Custom validation rule",
    type="FINAL_RESPONSE_QUALITY",
)
```

## Read the results

When a case fails, the cause usually points at one part of the system:

| Failure | Where to look |
| :--- | :--- |
| Wrong or missing tool call | The agent prompt and tool routing in `src/adk/agents.py` |
| English text in an answer | The language rules in the agent prompts |
| Missing quantities in a quote | Whether the room area reaches the quote agent |
| Extra routing question | The triage state tracking |

Compare runs before and after a prompt change with `--runs 3 --output results/`
to tell a real regression from model variance. Each live run costs Gemini API
usage: one agent call per case plus the judge calls.

## References

- [Backend test suite](../README.md)
- [Google ADK evaluation documentation](https://google.github.io/adk-docs/evaluate/)
