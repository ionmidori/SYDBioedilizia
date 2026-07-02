# Debug & Verification Scripts (manual, one-off)

Script manuali usati durante debugging e verifiche puntuali di fasi passate.
**Non fanno parte della test suite** (pytest raccoglie solo `tests/`) e non sono
eseguiti in CI. Molti richiedono credenziali live (Firebase/GCP) e un backend in
esecuzione: leggere l'header di ogni script prima di lanciarlo.

- `debug_*.py` — ispezione manuale di dati live (progetti, quote, utenti, file).
- `verify_*.py` — verifiche one-off di fasi storiche (E2E, passkey, isolation).
- `test_*.py` — script esplorativi ad-hoc (NON test pytest, nonostante il nome).
- `repro_*.py` — riproduzioni di bug specifici.

Per gli script operativi ricorrenti (ingestion RAG, cleanup, monitoring) vedere
la cartella padre `scripts/`.
