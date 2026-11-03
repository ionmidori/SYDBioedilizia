## Cosa e perché

<!-- Una o due frasi: il problema e la soluzione. -->

## Etichette (obbligatorie, `gh pr create --label a,b`)

- **Tipo** (una): `fix` → `bug`, `feat` → `enhancement`, `docs` → `documentation`, aggiornamenti di dipendenze → `dependencies`. `chore`/`refactor` non hanno etichetta di tipo.
- **Area** (tutte quelle toccate): `backend_python/` → `backend`, `web_client/` → `frontend`, `.github/workflows/` → `ci`, Dockerfile → `docker`, script e tooling → `tooling`.

## Checklist

- [ ] `npm run preflight` verde (o motivo per cui un controllo non si applica)
- [ ] Modelli Pydantic cambiati → interfacce TypeScript aggiornate (Golden Sync, 1:1)
- [ ] Nessun segreto, `.env` o chiave nel diff
- [ ] Nessuna chiave Gemini/Vertex né eval ADK nei workflow (sono solo manuali: `npm run eval:run*`)
- [ ] Se ho toccato prompt, agenti o tool ADK: ho eseguito a mano gli eval pertinenti e riporto l'esito qui sotto (non girano in CI)
- [ ] Se ho toccato `pyproject.toml`: `uv lock` eseguito e `uv.lock` incluso

## Verifiche eseguite

<!-- Comandi lanciati ed esiti (test, type-check, prove manuali). -->
