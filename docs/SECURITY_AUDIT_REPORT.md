# 🛡️ SYD Chatbot - Security Audit Report

**Data:** 16 Gennaio 2026
**Auditor:** Antigravity (Senior Security Engineer)
**Scope:** Architettura Split-Stack (Planned), Frontend Next.js (Existing), AI Core (Logic).

> **NOTA CRITICA**: Il backend Python FastAPI descritto nel "Migration Plan" **non è ancora implementato**.
> Questo audit analizza l'architettura *proposta* e il codice *attuale* (Node.js/Next.js) che funge da backend temporaneo.

---

## 🚨 Vulnerabilità Critiche (Priorità Immediata)

### 1. Broken Access Control (API Next.js Attuale)
**Posizione:** `web_client/app/api/chat/route.ts` & `ensureSession`
**Descrizione:**
L'API attuale accetta qualsiasi richiesta `POST` con un `sessionId` arbitrario.
- **Assenza di Validazione Token:** Non viene verificato l'header `Authorization` (Firebase ID Token).
- **Session Hijacking:** Chiunque indovini un `sessionId` può leggere/scrivere messaggi.
- **Resource Exhaustion:** Un attaccante può generare infiniti `sessionId` consumando la quota Gemini e Firestore.

**Fix Suggerito in `route.ts`:**
```typescript
import { auth } from 'firebase-admin';
const idToken = req.headers.get('Authorization')?.split('Bearer ')[1];
if (!idToken) return new Response('Unauthorized', { status: 401 });
const decodedToken = await auth().verifyIdToken(idToken);
// Usa decodedToken.uid per rate-limiting e ACL
```

### 2. Server-Side Request Forgery (SSRF) in `generate_render`
**Posizione:** `ai_core/src/chat-tools.ts`, riga 172
**Descrizione:**
Il tool `generate_render` esegue una `fetch(sourceImageUrl)` su qualsiasi URL fornito.
Un attaccante può fornire URL interni (es. `http://169.254.169.254/...`) per accedere ai metadati Cloud Run/EC2 o scansionare la rete locale.

**Fix Suggerito (Whitelist):**
```typescript
const ALLOWED_DOMAINS = ['storage.googleapis.com', 'firebasestorage.googleapis.com'];
const urlObj = new URL(sourceImageUrl);
if (!ALLOWED_DOMAINS.includes(urlObj.hostname)) {
    throw new Error('Domain not whitelisted');
}
```

### 3. Privacy Leakage: PII nei Log
**Posizione:** `ai_core/src/chat-tools.ts`, riga 353
**Descrizione:**
Il tool `submit_lead_data` stampa l'intero payload (Nome, Email, Telefono) nei log del server:
`console.log('[submit_lead_data] Saving lead to Firestore:', data);`
**Impatto:** Violazione GDPR. I log di Vercel/Cloud persistono dati sensibili.

---

## ⚠️ Rischi Architetturali (Piano Python)

### 4. Auth Handshake (Next.js -> Python)
**Riferimento:** `MIGRATION_PLAN_PYTHON.md`
**Analisi:**
Il piano prevede l'uso di un `Internal JWT` firmato con un segreto condiviso.
**Debolezza:** Se `INTERNAL_JWT_SECRET` viene esposto o committato per errore, l'intero backend Python è compromesso.
**Raccomandazione:**
Passare a **Google IAM Authentication (OIDC)**. Next.js (Identity) firma la richiesta verso Cloud Run (Python) usando il Service Account nativo. Python valida l'identity di Next.js senza gestire secret condivisi.

### 5. Prompt Injection (Insecure Output Handling)
**Posizione:** `web_client/components/ChatMessages.tsx` (Presunto)
**Analisi:**
Se l'LLM genera Markdown malevolo (es. link `javascript:alert(1)` o immagini tracking), il frontend deve sanificarlo.
**Check:** Verificare che `react-markdown` usi plugin come `rehype-sanitize`.

---

## 🛡️ Best Practices Mancanti

1.  **Strict Content Security Policy (CSP):** Implementare header CSP per impedire il caricamento di script esterni o iframe non autorizzati.
2.  **Rate Limiting per Utente (non IP):** L'attuale Rate Limit per IP è inefficace contro botnet. Passare al Rate Limit per UID Firebase.
3.  **Input Validation:** Validare il formato delle email e dei numeri di telefono in `submit_lead_data` lato server, non solo con Zod (che fa check sintattico base).

### Conclusione
L'attuale implementazione Next.js è vulnerabile (Public API). Consigliamo di implementare il Middleware di Auth Firebase **prima** di procedere con la migrazione a Python.
