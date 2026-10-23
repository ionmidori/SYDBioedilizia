# Script operativi (backend_python)

Strumenti da lanciare **a mano**, da `backend_python/`:

```bash
uv run python scripts/<nome>.py        # top-level
uv run python scripts/ops/<nome>.py    # ispezione dati
```

Gli script che leggono PDF (`extract_prezzario.py`, `pinecone_upload_pdf.py`) usano `pypdf`, che sta nell'extra `dev` e non è installata in produzione: lanciali con `uv run --extra dev python scripts/<nome>.py`.

- **Non** fanno parte della test suite: pytest raccoglie solo `tests/`, la CI non li esegue.
- Sono esclusi dall'immagine Cloud Run (`.dockerignore`) e, con #470, anche dall'upload di Cloud Build (`.gcloudignore`).
- Molti agiscono su **dati live** (Firestore, Storage, Pinecone) con le credenziali del `.env`: leggere l'header dello script prima di lanciarlo, soprattutto quelli che scrivono o cancellano.
- Non sono soggetti a ruff (`pyproject.toml`), ma lo sono alla guardia sui literal di modello Gemini (`tests/unit/test_model_registry.py`): i modelli si risolvono da `src/core/models.py`.
- Nuovi controlli ripetibili vanno scritti come test in `tests/`, non come script.
- Gli script di deploy e di configurazione di Google Cloud (Cloud Run, outbox email, alert) non stanno qui ma in `deploy/`: vedi [`deploy/README.md`](../deploy/README.md).

## RAG e listino

| Script | Scopo |
|---|---|
| `download_pdf.py` | Scarica il PDF del Prezzario Lazio in `data/` |
| `extract_prezzario.py` | Estrae le voci del prezzario dal PDF (Gemini multimodale) in JSON |
| `merge_prezzario.py` | Unisce le parti estratte in `data/prezzario_lazio_2023_structured.json` |
| `ingest_prezzario.py` | Upsert del prezzario su Pinecone, namespace `prezzario` (`--wipe` per svuotare prima) |
| `ingest_normative.py` | Upsert delle normative (`data/knowledge/normative/`) su Pinecone, namespace `normative` |
| `ingest_docs.py` | Chunking dei file markdown di una cartella e upsert su Pinecone (default namespace `normative`) |
| `pinecone_upload_pdf.py` | Caricamento di un PDF sull'indice |
| `inspect_pinecone.py` | Ispezione dell'indice (namespace, conteggi, query di prova) |
| `eval_rag.py` | Valutazione RAG con Ragas e Gemini come giudice (richiede `ragas`, `langchain-google-vertexai`) |
| `add_price_ranges.py` | Aggiunge `range_min`/`range_max` per il cliente agli SKU del seed `src/data/master_price_book.json` |

## Manutenzione dati (scrivono su Firestore/Storage)

| Script | Scopo |
|---|---|
| `cleanup_orphaned_files.py`, `cleanup_orphaned_firestore_files.py`, `cleanup_orphaned_storage.py` | Rimozione di file/record orfani |
| `cleanup_zombie_projects.py` | Cancella (con la sottocollezione `files`) i documenti `projects` senza `sessions` corrispondente |
| `repair_project_projections.py` | Ricostruisce le proiezioni denormalizzate dei progetti |
| `sync_all_covers.py`, `sync_project_names.py` | Risincronizza copertine e nomi dei progetti |
| `reset_guest_render_quota.py` | **Cancella** `usage_quotas/guest-session-_generate_render` (azzera la quota render degli ospiti). Senza `--yes` fa solo un dry run |
| `clear_registered_session_expiry.py` | Toglie `expireAt` (TTL 30 giorni) dalle sessioni degli utenti registrati e dai loro messaggi: riparazione una tantum dei dati scritti prima che la scadenza valesse solo per gli ospiti. Senza `--apply` fa solo un dry run |
| `set_admin_claim.py` | Assegna/revoca il custom claim `admin` a un utente |
| `configure_cors.py` | Imposta il CORS del bucket Storage (legge `firebase-service-account.json` dalla cartella corrente) |

## Infrastruttura e diagnostica

| Script | Scopo |
|---|---|
| `list_buckets.py`, `list_models.py` | Elenca bucket Storage e modelli Gemini disponibili |
| `generate_test_token.py` | ID token Firebase di 1 h per prove locali — **mai committarlo** |
| `canary_monitor.py` | Monitoraggio canary: error rate, latenza p50/p95/p99, soglie di rollback |
| `drain_check.py` | Drenaggio dei preventivi in volo durante un rollout (`--dry-run`, `--ttl-hours`, `--expire`) |
| `chat_latency_bench.py` | Benchmark di latenza della chat su scenari fissi (`--out` salva i risultati) |
| `chat_quality_ab.py` | Confronto A/B di due configurazioni chat (LLM-as-judge) sui file di `chat_latency_bench.py` |
| `generate_money_vectors.py` | Rigenera `contracts/money/golden_vectors.json`: i casi di arrotondamento degli importi su cui backend (`src/core/money.py`) e frontend (`web_client/lib/money.ts`) devono dare lo stesso risultato. Non tocca dati; un test fallisce se il file non è aggiornato |

## `ops/` — ispezione in sola lettura

| Script | Scopo |
|---|---|
| `debug_projects.py`, `debug_project_status.py`, `verify_projects_query.py` | Progetti recenti, stato, query per utente |
| `debug_sessions.py` | Sessioni chat recenti |
| `debug_all_files.py`, `debug_file_timestamps.py`, `debug_image_access.py` | File di progetto, timestamp, raggiungibilità delle immagini |
| `debug_users.py` | Elenco utenti |
| `inspect_feedback.py` | Feedback sui messaggi e messaggi collegati |
| `check_firebase_credentials.py` | Diagnostica del formato di `FIREBASE_PRIVATE_KEY` e connessione |
