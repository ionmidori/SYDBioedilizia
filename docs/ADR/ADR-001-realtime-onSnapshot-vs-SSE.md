# ADR-001: Firebase `onSnapshot` vs. Backend SSE for Real-time Data

**Status**: ACCEPTED  
**Date**: 2026-02-26  
**Author**: Antigravity (AI Architect)  
**Related Plan**: `docs/PLANS/FRONTEND_REFACTORING_TASKS.md` — Phase 5

---

## Contesto (Context)

L'architettura del progetto segue la **"3-Tier Law"**: nessun accesso diretto al database è permesso dal Tier 2 (Frontend). Il frontend deve comunicare **esclusivamente** con il Tier 3 (Backend FastAPI).

L'analisi del codebase ha identificato **3 punti di utilizzo di `onSnapshot`** (Firestore Client SDK) nel frontend:

| # | File | Collezione | Scopo |
|---|------|-----------|-------|
| 1 | `hooks/useUserPreferences.ts` | `users/{uid}/preferences/general` | Sincronizzazione preferenze UI in tempo reale |
| 2 | `hooks/useChatHistory.ts` | `sessions/{sessionId}/messages` | Streaming messaggi chat in arrivo |
| 3 | `components/dashboard/ProjectFilesView.tsx` | `projects/{projectId}/files` | Aggiornamento file del progetto in tempo reale |

---

## Valutazione Tecnica (Technical Feasibility of Migration)

### Opzione A: Migrare tutto a Backend SSE/WebSocket

**Architettura proposta**:
- Backend FastAPI aggiunge endpoint `/api/users/preferences/stream` (SSE)
- Backend FastAPI gestisce il listener Firestore tramite `firebase-admin` SDK e notifica il client via SSE
- Frontend usa `EventSource` o `fetch + ReadableStream` per ricevere gli aggiornamenti

**Vantaggi**:
- ✅ Conformità al 100% con la "3-Tier Law"
- ✅ Centralizzazione della logica di business
- ✅ Possibilità di aggiungere logica di autorizzazione fine-grained lato server

**Svantaggi**:
- ❌ **Complessità significativa**: ogni `onSnapshot` da Cloud Run richiede una connessione persistente — in un ambiente serverless/container, le SSE in uscita aumentano la latenza di cold-start e il costo per connessione simultanea
- ❌ **Scalabilità**: Cloud Run con `max-instances` limitato non gestisce bene migliaia di SSE aperte contemporaneamente senza un broker (Redis Pub/Sub, etc.)
- ❌ **Latenza aggiuntiva**: il flusso passerebbe da `Firestore → Client` (1 hop) a `Firestore → FastAPI → Client` (2 hop), con latenza aggiuntiva stimata di 50-150ms
- ❌ **Costo operativo**: ora di sviluppo stimata ≥ 3 giorni per testare e stabilizzare

### Opzione B: Mantenere `onSnapshot` come Eccezione Documentata

**Condizioni per l'eccezione**:
1. I dati letti tramite `onSnapshot` appartengono **esclusivamente** all'utente autenticato
2. Le Firestore Security Rules garantiscono l'isolamento (`userId == request.auth.uid`)
3. **Nessuna logica di business** è eseguita nel callback — solo aggiornamento dello stato UI
4. Tutti i **write** passano obbligatoriamente per il backend Python (`usersApi.updatePreferences()`)

---

## Decisione (Decision)

**Si mantiene `onSnapshot` come eccezione architetturale documentata** per tutti e 3 i punti d'uso identificati.

### Motivazione

Il pattern di `onSnapshot` per dati **owned dall'utente** rappresenta un'eccezione legittima alla "3-Tier Law" poiché:
- Firebase Client SDK fornisce sicurezza a livello di regola dichiarativa (Firestore Security Rules)
- Il costo/latenza di un intermediario SSE supera i benefici architetturali in questo specifico contesto
- La "3-Tier Law" è progettata per prevenire **write** inconsistenti e logica di business lato client — non per vietare **read** ottimizzati di dati dell'utente

### Vincoli Obbligatori (Guardrails)

Per essere accettato come eccezione, ogni utilizzo di `onSnapshot` **DEVE** rispettare questi vincoli:

1. **Auth Guard**: Deve verificare `user?.uid` prima di sottoscriversi
2. **Null-check**: Il callback deve gestire documenti non esistenti (`snapshot.exists()`)
3. **Cleanup**: Deve sempre restituire la funzione `unsubscribe` dall'`useEffect`
4. **Write delegation**: Qualsiasi modifica ai dati **DEVE** essere delegata al backend Python
5. **Documentazione**: Il componente/hook deve referenziare questo ADR nei commenti

---

## Pattern Template (Hardened Pattern)

```typescript
// ADR-001: Documented onSnapshot exception. Data is user-owned and read-only.
// All writes go through backend API (usersApi / projectsApi).
useEffect(() => {
    if (!user?.uid) {
        setIsLoading(false);
        return; // Guard: no auth, no subscription
    }

    const unsubscribe = onSnapshot(
        doc(db, 'users', user.uid, '...'),
        (snapshot) => {
            if (snapshot.exists()) {
                setData(snapshot.data() as MyType);
            }
            setIsLoading(false);
        },
        (error) => {
            logger.error('[HookName] onSnapshot error:', error.code);
            setError('...'); // User-facing error message
            setIsLoading(false);
        }
    );

    return () => unsubscribe(); // Always clean up
}, [user?.uid]);
```

---

## Compliance Check dei 3 Punti d'Uso

| Hook/Component | Auth Guard | Null-check | Cleanup | Write via Backend | ✅ Conforme |
|---|---|---|---|---|---|
| `useUserPreferences` | ✅ `!user?.uid` | ✅ `snapshot.exists()` | ✅ `return () => unsubscribe()` | ✅ `usersApi.updatePreferences()` | **SÌ** |
| `useChatHistory` | ✅ Condizionale | ✅ `firestoreOnSnapshot` | ✅ Dynamic import pattern | ✅ Backend streaming | **SÌ** |
| `ProjectFilesView` | ✅ `!projectId \|\| !db` | ⚠️ Missing `snapshot.exists()` — solo `snapshot.docs.map` | ✅ `return () => unsubscribe()` | ✅ Via `FileUploader` | **PARZIALE** |

> [!WARNING]
> `ProjectFilesView.tsx` (punto 3) manca del null-check su `snapshot.exists()`. Sebbene non critico (la query restituisce una collection, non un documento), aggiungere una gestione dell'errore esplicita nel callback è raccomandato prima del prossimo deploy in produzione.

---

## Conseguenze (Consequences)

**Positive**:
- Zero overhead di migrazione verso SSE
- Latenza ottimale per gli update UI delle preferenze
- Conformità garantita lato sicurezza tramite Security Rules esistenti

**Negative**:
- Dipendenza dal Firebase Client SDK nel Tier 2 (tollerata, documentata)
- Necessità di tenere aggiornata la lista dei punti d'uso (Task 5.1)

**Azioni di Follow-up**:
- [ ] Aggiungere error handling al callback `onSnapshot` in `ProjectFilesView.tsx`
- [ ] Aggiungere commento `// ADR-001` in ogni punto d'uso come riferimento

_Documento approvato: 2026-02-26_
