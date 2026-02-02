# Strategia Backend Ibrida: Firebase + Supabase

Questo documento definisce l'approccio operativo per integrare Firebase e Supabase all'interno del progetto **Renovation Next**, seguendo la **3-Tier Operational Architecture**.

## Strategia di Integrazione (Intent)

L'obiettivo è combinare la potenza relazionale di **Supabase (PostgreSQL)** con l'ecosistema mobile e di autenticazione di **Firebase**.

### Source of Truth (SOT)
- **Identity & Auth:** Firebase Authentication.
- **Dati Strutturati:** Supabase (Progetti, Asset, Relazioni Professionali).
- **Dati Real-time/Effimeri:** Firebase Firestore (Chat, Notifiche, Stato UI).
- **File Storage:** Firebase Storage (Asset principali) e Supabase Storage (DB-integrated assets).

---

## Architettura a 3 Livelli (Operational)

### Tier 1: Direttiva (Intent & Strategy)
Ogni nuova feature deve specificare dove risiedono i dati:
- Utilizzare **Supabase** per query complesse, filtri avanzati e integrità referenziale.
- Utilizzare **Firebase** per feature che richiedono notifiche push o sincronizzazione offline spinta.

### Tier 2: Orchestration (Frontend/Next.js)
- **SDK:** Entrambi gli SDK sono installati.
- **Workflow:** 
  1. L'utente esegue il login tramite Firebase.
  2. Il frontend recupera il JWT (IdToken).
  3. Il JWT viene inviato negli header `Authorization` per le richieste al Backend o direttamente a Supabase (previa configurazione).

### Tier 3: Execution (Backend/Python - FastAPI)
Il Backend Python funge da orchestratore deterministico:
1. **Validazione:** Verifica il JWT di Firebase tramite `firebase-admin`.
2. **Autorizzazione:** Estrae lo `uid` e lo utilizza per eseguire query su **Supabase** tramite la libreria `supabase-py`.
3. **Logica:** Elabora i dati e restituisce risposte tipizzate (Pydantic) sincronizzate con TypeScript.

---

## Piano di Implementazione Tecnica

### 1. Sincronizzazione Auth
Configurazione di Supabase per accettare i JWT di Firebase come provider esterno:
- Estrarre la chiave pubblica di Firebase.
- Configurare lo `schema` di validazione JWT in Supabase GoTrue.

### 2. Modelli Dati
> [!IMPORTANT]
> Mantenere la sincronizzazione stretta tra Pydantic (Backend) e TypeScript (Frontend).

| Entity | Location | Rationale |
| :--- | :--- | :--- |
| **User Profile** | Firestore | Accesso rapido, Metadata Auth |
| **Project Data** | Supabase | Relazioni complesse (Asset <-> Room) |
| **Gallery/Assets**| Supabase | Sorting e Filtering avanzato |

---

## Pro & Contro

### ✅ Vantaggi
- **Query SQL:** Possibilità di eseguire JOIN complesse che su Firestore richiederebbero molteplici letture.
- **Type Safety:** Postgres garantisce che i dati nel Tier 3 siano sempre coerenti.
- **Ecosistema:** Accesso a tutti i servizi Google Cloud tramite Firebase.

### ⚠️ Sfide
- **Latenza:** Una richiesta aggiuntiva per la validazione del token.
- **Complessità:** Gestione di due console di amministrazione separate.
