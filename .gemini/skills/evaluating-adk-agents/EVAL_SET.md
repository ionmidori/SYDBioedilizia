# SYD Eval Set — Test Case Library

## Test Case Format (ADK `.test.json`)

```json
{
  "eval_set_id": "syd_quote_v1",
  "eval_cases": [
    {
      "eval_id": "bagno_preventivo_no_furniture",
      "conversation": [
        {
          "invocation_id": "inv_001",
          "user_content": {
            "parts": [{ "text": "Voglio ristrutturare il bagno. Ho visto un render moderno con doccia walk-in. Quant'è il preventivo?" }],
            "role": "user"
          },
          "expected_tool_use": [
            { "tool_name": "suggest_quote_items" }
          ],
          "expected_intermediate_agent_responses": [],
          "reference": "Il preventivo include solo lavori edili: demolizione piastrelle, impermeabilizzazione, posa gres, idraulica, impianto elettrico. NON include: sanitari, rubinetteria, mobile bagno, specchi."
        }
      ]
    }
  ]
}
```

## SYD Scenario Library

### Scenario 1 — Preventivo bagno (core happy path)
**Input**: "Voglio ristrutturare il bagno, ho una foto"
**Expected tools**: `suggest_quote_items`
**Rubric checks**: `no_furniture`, `has_mq`, `sku_present`, `italian_only`
**Known failure mode**: AI include "fornitura sanitari" nel preventivo → rubric `no_furniture` = 0.0

### Scenario 2 — Rendering soggiorno (design flow)
**Input**: foto soggiorno + "voglio vedere come potrebbe diventare moderno"
**Expected tools**: `generate_render`
**Rubric checks**: `italian_only` — nessun SKU atteso (è design, non preventivo)
**Known failure mode**: orchestrator instrada a `quote` invece di `design`
→ catturato da `tool_trajectory_avg_score`

### Scenario 3 — Triage intent-first (nuovo comportamento)
**Input**: foto senza testo
**Expected tool**: nessuno — orchestrator deve rispondere con domanda intento
**Expected response contains**: "1. Rendering" AND "2. Preventivo"
**Rubric check**: response NOT contains `suggest_quote_items` call

### Scenario 4 — Preventivo in quota flow (upload foto mid-flow)
**Setup**: conversazione già in corso su preventivo (messaggio precedente: "voglio un preventivo")
**Input**: nuova foto caricata senza testo
**Expected**: `triage` analizza la foto, NON ripropone la domanda di routing
**Rubric check**: response NOT contains "Come vuoi procedere?"

### Scenario 5 — Hallucination check (prezzi inventati)
**Input**: "quanto costa rifare il parquet in un soggiorno di 25mq?"
**Expected**: tool `suggest_quote_items` OR `market_prices` chiamato
**Hallucination check**: prezzi nella risposta devono corrispondere al price book
**Metric**: `hallucinations_v1` threshold 0.85

---

## Eval Set File Structure

```
backend_python/tests/evals/
├── test_config.json          ← criteri e soglie globali
├── quote_flow.test.json      ← scenari 1, 4, 5
├── design_flow.test.json     ← scenario 2
├── triage_flow.test.json     ← scenario 3
├── syd_rubrics.py            ← definizioni rubric SYD
└── run_evals.py              ← script standalone (no pytest)
```

## Golden Dataset Maintenance

1. Ogni volta che un admin **corregge** una risposta nel dashboard → salva la correzione come nuovo `eval_case`
2. Ogni volta che un utente dà 👎 → il messaggio diventa candidato per eval set (review manuale)
3. **Non aggiungere** test case per scenari banali — focus su edge case e failure mode noti

## Aggiungere un nuovo test case (workflow)

```bash
# 1. Identifica il messaggio problematico dal log
# 2. Crea il test case JSON
# 3. Verifica che il caso fallisca prima del fix
uv run python tests/evals/run_evals.py --filter bagno_preventivo_no_furniture
# 4. Fix del prompt
# 5. Verifica che ora passi
uv run python tests/evals/run_evals.py --filter bagno_preventivo_no_furniture
# 6. Aggiungi al CI
```
