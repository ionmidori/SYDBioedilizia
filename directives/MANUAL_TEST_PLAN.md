# Protocollo di Test Manuale - Remediation Audit (V1.0)

Questo documento elenca i test necessari per validare la rimozione delle Shadow API e l'integrità del sistema Tier-3 (Next.js + Python FastAPI).

---

## 🏗️ Preparazione Ambiente
1. **Backend**: Assicurati che il server Python sia attivo.
   ```bash
   cd backend_python
   uvicorn main:app --reload --port 8000
   ```
2. **Frontend**: Assicurati che Next.js sia attivo.
   ```bash
   cd web_client
   npm run dev
   ```

---

## 🧪 Test 1: Lead Capture & Golden Sync
**Obbiettivo**: Verificare che l'invio lead passi per il backend Python e usi le rotte centralizzate.

1. Vai alla Landing Page.
2. Compila il form `LeadCaptureForm` (SYD).
3. Apri il tab **Network** dei DevTools.
4. **Verifica**:
   - [ ] La chiamata deve andare a `POST /api/py/submit-lead` (Backend Python).
   - [ ] **NON** deve esserci nessuna chiamata a `/api/lead-magnet` (Node.js).
   - [ ] Il lead deve apparire correttamente in Firestore sotto la collezione `leads`.

---

## 🧪 Test 2: Chat History & SWR
**Obbiettivo**: Verificare il caricamento della history via Python API con polling asincrono.

1. Accedi al Dashboard e apri un progetto esistente.
2. Apri il tab **Network**.
3. **Verifica**:
   - [ ] Chiamata `GET /api/py/sessions/{id}/messages` caricata al mount.
   - [ ] Polling attivo: ogni 5 secondi deve partire una nuova richiesta SWR.
   - [ ] I messaggi si caricano senza errori di "hydration" o delay eccessivi.

---

## 🧪 Test 3: Dashboard Media Upload (Refactored)
**Obbiettivo**: Verificare che il nuovo `FileUploader.tsx` (allineato Phase 7) funzioni realmente.

1. Vai su **Progetto > Galleria & File**.
2. Clicca su **Carica File**.
3. Seleziona un'immagine (JPG/PNG).
4. **Verifica**:
   - [ ] La barra di progresso si muove in tempo reale (non è una simulazione).
   - [ ] La chiamata Network va direttamente a Firebase Storage (via client-side hook).
   - [ ] Al completamento, il file appare nella galleria con i metadati corretti salvati via Firestore (controlla i log backend).
   - [ ] **Controllo Cruciale**: Nessuna richiesta fallita verso `/api/upload` (Shadow API eliminata).

---

## 🧪 Test 4: Chat Media Upload & Metadata
**Obbiettivo**: Verificare che l'AI riceva i metadati estesi (`mimeType`, `fileSize`).

1. Nel ChatWidget, carica un file (Immagine o PDF).
2. Apri la console dei DevTools o ispeziona il payload della richiesta di invio messaggio.
3. **Verifica**:
   - [ ] L'oggetto `attachments` deve contenere `originalFileName`, `mimeType` e `fileSize`.
   - [ ] L'AI deve rispondere confermando (es. "Ho ricevuto l'immagine [NOME_FILE]").

---

## 🧪 Test 5: AI Reasoning UI (CoT)
**Obbiettivo**: Verificare il rendering dei passaggi di ragionamento.

1. Invia una richiesta complessa all'AI (es. "Fai un preventivo per ristrutturare questo bagno").
2. **Verifica**:
   - [ ] Sopra la risposta dell'AI appare il widget **"Ragionamento AI"** (Gold Box).
   - [ ] Espandendo il widget, si vede il testo del ragionamento.
   - [ ] Badge di status: `continue` | `pause` | `complete` visibili.
   - [ ] Barra di confidence (verde/ambra/rossa) coerente con lo score ricevuto.

---

## 🧪 Test 6: Observability Check (Post-Audit)
**Obbiettivo**: Verificare che i log e le metriche siano emessi.

1. Esegui una qualsiasi operazione API.
2. Controlla il terminale del backend Python.
3. **Verifica**:
   - [ ] Log in formato JSON strutturato.
   - [ ] Presenza di `request_id` in ogni log.
   - [ ] Header `X-Response-Time` presente nella risposta HTTP ricevuta dal browser.

---

## 🏁 Esito Finale
Se tutti i punti sopra sono [x], la remediation è **VALIDATA** per la produzione.
