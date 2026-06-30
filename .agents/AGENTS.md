# Project-Scoped Rules — SYD Bioedilizia

## Model Version Policy (Override della regola globale §15)

> La regola globale §15 dichiarava "Modello standard minimo: `gemini-2.5-flash`".
> Questa è stata superata dalla migrazione a Gemini 3.1 (completata pre-Phase 86).

**Modelli in produzione (verificati Giu 29, 2026):**

| Uso | Modello | File di riferimento |
|---|---|---|
| **Chat / Agents** (triage, design, quote, orchestrator) | `gemini-3.1-flash-lite-preview` | `src/adk/agents.py` |
| **Config default** (`CHAT_MODEL_VERSION`) | `gemini-3.1-flash-lite-preview` | `src/core/config.py:61` |
| **Vision** (CAD, triage, analyze, measure_room, web_architect) | `gemini-3.1-flash-lite-preview` | `src/vision/*.py` |
| **Image Generation** (T2I / I2I) | `gemini-3.1-flash-image-preview` | `src/api/gemini_imagen.py:31-32` |
| **RAG scripts** (offline, non runtime) | `gemini-2.5-flash` | `scripts/extract_prezzario.py`, `scripts/eval_rag.py` |
| **Verify scripts** (offline) | `gemini-3.1-flash-preview` | `scripts/verify_gemini.py` |

**Regola aggiornata:**
- **Modello standard minimo runtime:** `gemini-3.1-flash-lite-preview` (chat/agents/vision).
- **Rendering:** `gemini-3.1-flash-image-preview`.
- **Vietato usare versioni < 3.1** in codice runtime. Le versioni 2.5 sono consentite solo in script offline.
