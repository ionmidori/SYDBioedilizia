# Self-Correction Loop — Da Eval Failure a Prompt Fix

## Il Loop Completo

```
Produzione
    │
    ▼
Errore rilevato (feedback 👎, admin correction, hallucination log)
    │
    ▼
[FASE 1] Creare test case nel eval set
    │
    ▼
[FASE 2] Runnare ADK evals → identificare rubric fallita
    │
    ▼
[FASE 3] Diagnosi: quale componente del prompt ha causato il failure?
    │
    ▼
[FASE 4] Patch prompt (few-shot negativo o regola esplicita)
    │
    ▼
[FASE 5] Runnare eval → verificare fix → commit
    │
    ▼
Monitoraggio continuo
```

---

## FASE 1 — Creare il Test Case

Dal log di produzione o dal feedback utente, isola il caso problematico:

```python
# Script: tests/evals/scripts/create_test_case.py
import json

def create_test_case(
    eval_id: str,
    user_message: str,
    expected_tool: str | None,
    reference_response: str,
    rubric_ids: list[str],
) -> dict:
    """
    Crea un test case ADK-compatible da un caso reale.
    reference_response = come DOVREBBE rispondere SYD (scritto da umano).
    """
    return {
        "eval_id": eval_id,
        "conversation": [{
            "invocation_id": f"inv_{eval_id}",
            "user_content": {"parts": [{"text": user_message}], "role": "user"},
            "expected_tool_use": [{"tool_name": expected_tool}] if expected_tool else [],
            "reference": reference_response,
        }]
    }
```

---

## FASE 2 — Diagnosticare il Failure

Dopo `AgentEvaluator.evaluate()`, analizza `EvaluationResult`:

```python
from google.adk.evaluation import AgentEvaluator

results = await AgentEvaluator.evaluate_eval_set(
    agent_module="src.adk.agents",
    eval_set=eval_set,
    print_detailed_results=True,
)

# Identifica i rubric falliti
for case_result in results.per_invocation_results:
    for rubric_score in (case_result.rubric_scores or []):
        if rubric_score.score < 0.7:
            print(f"FAIL — rubric: {rubric_score.rubric_id}")
            print(f"  Rationale: {rubric_score.rationale}")
            # → La rationale del judge LLM spiega PERCHÉ ha fallito
```

La **rationale** del `RubricBasedEvaluator` è il punto di partenza della diagnosi.
Esempio: `rubric_id=no_furniture, score=0.0, rationale="Response mentions 'mobile bagno' which is furniture"`

---

## FASE 3 — Mappa Failure → Componente Prompt

| Rubric fallita | Componente responsabile | File da modificare |
|---|---|---|
| `no_furniture` | `<sydbioedilizia_scope>` boundary | `src/prompts/components/modes.py` |
| `italian_only` | `OUTPUT_RULES` | `src/prompts/components/identity.py` |
| `has_mq` | InsightEngine system prompt | `src/services/insight_engine.py` |
| `sku_present` | `_QUANTITY_SURVEYOR_PROMPT` | `src/services/insight_engine.py` |
| Tool trajectory fail | Routing rules orchestrator | `src/adk/agents.py` |
| Hallucination in prices | Few-shot examples | `src/services/insight_engine.py` |
| Routing question in quote flow | Triage conclusione adattiva | `src/adk/agents.py` |

---

## FASE 4 — Patch Prompt (Tecniche)

### Tecnica A — Few-shot negativo (più efficace)

Aggiungi un esempio "cosa NON fare" direttamente nel prompt:

```python
# In insight_engine.py o modes.py
_FEW_SHOT_NEGATIVE = """
⛔ ESEMPIO ERRATO (non fare):
USER: "Ristruttura il bagno con nuova doccia"
ASSISTANT: "Preventivo: ... Fornitura mobile bagno €450 ..."
MOTIVO ERRORE: 'mobile bagno' è arredo, non lavoro edilizio.

✅ ESEMPIO CORRETTO:
ASSISTANT: "Preventivo: ... Posa rivestimento ceramica pareti 18mq €720 ..."
"""
```

### Tecnica B — Regola esplicita (per failure sistematici)

Aggiungi una regola in forma imperativa al blocco `<sydbioedilizia_scope>`:

```python
# Aggiunta a modes.py dopo il boundary block
"REGOLA ASSOLUTA #{n}: [descrizione regola in maiuscolo]"
"Esempio proibito: [cosa ha scritto l'AI quando ha sbagliato]"
```

### Tecnica C — Primacy+Recency (per failure intermittenti)

Se la regola esiste già ma viene dimenticata:
1. Sposta la regola **in cima** al prompt (primacy) E
2. Ripetila **in fondo** al prompt (recency)
→ Questa è la "LLM Sandwich" già in uso in `agents.py` con `SECURITY_GUARDRAILS`

---

## FASE 5 — Verifica Fix

```bash
# Prima del fix: deve fallire
uv run pytest tests/evals/ -k "no_furniture" -v
# FAILED ✗

# Dopo il fix: deve passare
uv run pytest tests/evals/ -k "no_furniture" -v
# PASSED ✓

# Nessuna regressione
uv run pytest tests/evals/ -v
# All N tests PASSED ✓
```

Commit con messaggio:
```
fix(prompt): enforce no-furniture boundary — eval no_furniture now passes

Closes eval case: bagno_preventivo_no_furniture
Root cause: InsightEngine few-shot example included "mobile bagno"
Fix: added negative few-shot + moved rule to primacy position
```

---

## Quando usare Fine-Tuning vs Prompt Engineering

| Situazione | Approccio |
|---|---|
| Failure su 1-3 casi specifici | Prompt fix (few-shot negativo) |
| Failure sistematico su categoria | Regola esplicita + primacy/recency |
| Failure su ≥20% dei test case | Considerare raccolta dataset per fine-tuning |
| Failure su safety/hallucination | Prima prompt, poi fine-tuning se persiste |

Gemini fine-tuning richiede ≥ 100 esempi qualità alta. Non investire prima di avere i dati.
