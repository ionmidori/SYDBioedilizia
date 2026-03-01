# SYD Bioedilizia — n8n Workflow Suite (Enterprise Grade)

Quattro workflow pronti per l'importazione in n8n, implementati con pattern enterprise:
**HMAC validation · Retry con backoff · Audit logging · Error handling centralizzato · Firestore sync**

---

## Architettura dei Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SYD n8n Automation Suite                            │
│                                                                             │
│   ┌─────────────┐   ┌─────────────────────┐   ┌──────────────────────┐     │
│   │  POLLER     │──▶│  NOTIFY ADMIN        │──▶│   DELIVER QUOTE      │     │
│   │  (5 min)   │   │  (Webhook POST)       │   │   (Webhook POST)     │     │
│   └─────────────┘   └─────────────────────┘   └──────────────────────┘     │
│          │                   │  │                       │  │                │
│          │                   │  │ ✓ HMAC Validation     │  │ ✓ HMAC + Joi   │
│          │                   │  │ ✓ Email (urgente/norm) │  │ ✓ Email HTML   │
│          │                   │  │ ✓ Telegram Alert       │  │ ✓ Twilio WA    │
│          │                   │  │ ✓ Audit Log Backend    │  │ ✓ Firestore sync│
│          │                   │  └──────────────┐         │  │ ✓ Audit Log    │
│          └──────────────────────────────────── │ ──────── │ ─┘              │
│                                                ▼          ▼                 │
│                                       ┌─────────────────────┐               │
│                                       │   ERROR HANDLER      │               │
│                                       │   (Error Trigger)    │               │
│                                       │ ✓ Severity classifier │               │
│                                       │ ✓ Telegram critico    │               │
│                                       │ ✓ Email con stack     │               │
│                                       │ ✓ Log → Backend       │               │
│                                       └─────────────────────┘               │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Workflow 1: Notify Admin (`workflow_notify_admin.json`) v2

**Evento**: `quote_ready_for_review`
**Trigger**: `POST /webhook/syd-notify-admin`
**Pattern**: Signed Webhook → Validate → Extract → Branch → Email + Telegram → Audit

### Funzionalità Enterprise
| Feature | Dettaglio |
|---------|-----------|
| **HMAC-SHA256** | Ogni request validata con `X-SYD-Signature` header (timing-safe compare) |
| **Email bilingue** | Template HTML responsive con urgenza visuale (rosso vs blu-scuro) |
| **Telegram Alert** | Notifica real-time con Markdown, link diretto alla console admin |
| **Audit Log** | POST al backend con execution_id per ogni notifica inviata |
| **Error Branch** | 401 se firma non valida; `errorWorkflow` per errori runtime |

### Payload di Input
```json
{
  "project_id": "proj_abc123",
  "client_name": "Mario Rossi",
  "estimated_value": 15000.00,
  "item_count": 12,
  "urgency": "high",
  "ai_summary": "Ristrutturazione bagno + cucina. Voci principali: demolizioni, impianti.",
  "review_url": "https://admin.sydarchitetto.it/quotes/proj_abc123",
  "notify_channels": ["email", "telegram"]
}
```

---

## Workflow 2: Deliver Quote (`workflow_deliver_quote.json`) v2

**Evento**: `quote_approved_deliver`
**Trigger**: `POST /webhook/syd-deliver-quote`
**Pattern**: Signed Webhook → Validate → Build HTML → Route → Send → Firestore Sync → Audit

### Funzionalità Enterprise
| Feature | Dettaglio |
|---------|-----------|
| **HMAC-SHA256** | Validazione firma come Workflow 1 |
| **Payload Validation** | Campi obbligatori, regex email, HTTPS URL, enum delivery_channel |
| **Email HTML** | Template premium SYD con gradient, CTA gold, note admin, scadenza offerta |
| **WhatsApp Twilio** | Integrazione ufficiale Twilio WhatsApp Business (non hackish httpRequest) |
| **Firestore Sync** | `PATCH /api/projects/:id/status` → `quote_sent` con retry 3x backoff 2s |
| **Audit Log** | Success/failure per ogni canale di consegna |
| **Error Responses** | 401 (HMAC), 422 (Validation), 200 con execution_id |

### Payload di Input
```json
{
  "project_id": "proj_abc123",
  "client_name": "Mario Rossi",
  "client_email": "mario.rossi@example.com",
  "client_phone": "+393331234567",
  "pdf_url": "https://storage.googleapis.com/syd.../quote_abc123.pdf",
  "quote_total": 15000.00,
  "quote_number": "SYD-2026-001",
  "delivery_channel": "both",
  "admin_notes": "Prezzo bloccato fino al 30/06/2026.",
  "expiry_date": "2026-06-30T23:59:59Z"
}
```

---

## Workflow 3: Error Handler (`workflow_error_handler.json`) v1

**Tipo**: Error Workflow (configurato come `errorWorkflow` negli altri workflow)
**Trigger**: Automatico quando un workflow SYD fallisce

### Funzionalità Enterprise
| Feature | Dettaglio |
|---------|-----------|
| **Severity Classifier** | `critical` (Deliver Quote, HMAC attack) · `high` (Notify Admin) · `medium` (altri) |
| **Email Critica** | Stack trace HTML, action required se progetto identificato, link execution n8n |
| **Telegram Critico** | Alert immediato per errori critici con context completo |
| **Backend Logging** | POST `/api/internal/error-log` per persistenza su Firestore |
| **No Loop** | `continueOnFail=true` sul backend log per evitare loop di errori |

### Come Configurare
In ogni workflow SYD, nel pannello Settings → Error Workflow: `SYD — Error Handler`

---

# ⚡ SYD Automation Suite (n8n Workflows)

**Status:** Production (v2.x)
**Core Engine:** n8n v1.x+
**Security:** HMAC-SHA256 Multi-Layer Validation

---

## 🏗️ Architecture & Security Patterns

The SYD Automation Suite handles critical notifications and document delivery. It is integrated with the Python Backend via the **MCP (Model Context Protocol)**.

### 1. HMAC Validation (Zero-Trust)
Every webhook entry point enforces **HMAC-SHA256 signature verification**.
- The payload is signed by the Python backend using a shared `SYD_WEBHOOK_SECRET`.
- n8n validates the `X-Hub-Signature-256` header before execution.
- Prevents unauthorized triggers and replay attacks.

### 2. Standardized Response Format
Workflows return a consistent JSON schema for tool-calling integration:
```json
{ "status": "success", "request_id": "...", "timestamp": "..." }
```

---

## 📂 Workflow Catalog

### 🔔 `notify_admin` (Telegram/Email)
Triggered when high-value events occur (e.g., Lead captured, Error in AI Graph).
- **Channels:** Telegram Bot + SendGrid Email.
- **Priority:** High.

### 📄 `deliver_quote` (Document Dispatch)
Automated delivery of generated PDFs to clients.
- **Logics:** Fetches Signed URL from Firebase, attaches to email, and logs final delivery state in Firestore.

### 🧪 `test_webhook` (Diagnostic)
Used for connectivity and HMAC validation verification during deployment.

---

## 🛠️ Configuration

### Required Credentials in n8n
- **Telegram:** `sy_bot` credentials.
- **SendGrid:** API Key for document delivery.
- **Firebase:** Service Account for Firestore updates (Status: Sent).
- **HMAC Secret:** `SYD_WEBHOOK_SECRET`.

---
*Updated: March 1, 2026 — Phase 42*
SYD_INTERNAL_TOKEN=<jwt-token-service-account>      # Token per chiamate backend → backend

# URL
SYD_BACKEND_URL=https://syd-brain-xxxxx-uc.a.run.app
ADMIN_CONSOLE_URL=https://admin.sydarchitetto.it
N8N_INSTANCE_URL=https://n8n.sydarchitetto.it

# Notifiche
ADMIN_EMAIL=admin@sydarchitetto.it
TELEGRAM_ADMIN_CHAT_ID=<chat_id_admin>

# WhatsApp (Twilio)
TWILIO_WHATSAPP_NUMBER=+14155238886   # Numero sandbox Twilio o numero produzione

# Monitoring
N8N_INSTANCE_ID=syd-production
```

---

## Configurazione Backend (`.env`)

```env
# Webhook Security
WEBHOOK_SIGNING_KEY=<stesso-valore-di-SYD_WEBHOOK_SECRET>

# n8n Endpoints
N8N_WEBHOOK_NOTIFY_ADMIN=https://n8n.sydarchitetto.it/webhook/syd-notify-admin
N8N_WEBHOOK_DELIVER_QUOTE=https://n8n.sydarchitetto.it/webhook/syd-deliver-quote

# Polling Support
ADMIN_NOTIFIED_FLAG=admin_notified_at   # campo Firestore usato per de-duplication
```

---

## Come Importare in n8n

1. Apri n8n → **Workflows** → **Import from File**
2. Importa **prima** `workflow_error_handler.json` (gli altri lo referenziano)
3. Importa gli altri workflow in qualsiasi ordine
4. Configura le credenziali:
   - Settings → Credentials → **SMTP** (email)
   - Settings → Credentials → **Telegram API** (bot token)
   - Settings → Credentials → **Twilio** (Account SID + Auth Token)
5. Imposta tutte le **Variables** (vedi tabella sopra)
6. Attiva i workflow (toggle in alto a destra)
7. Copia le **Production Webhook URL** generate da n8n
8. Aggiorna `backend_python/.env` con le URL dei webhook

---

## Sicurezza (Produzione)

### n8n Webhook Security
```
Workflow Settings → Authentication: Header Auth
Header: X-SYD-Signature
Value: verificato via HMAC-SHA256 nel nodo "Valida Firma HMAC"
```

### IP Allowlist (opzionale)
```
Allowed IPs: <IP_EGRESS_CLOUD_RUN>
```

### Rotazione Secret
```bash
# Genera nuovo secret HMAC (32 byte hex)
python3 -c "import secrets; print(secrets.token_hex(32))"

# Aggiorna in:
# 1. backend_python/.env → WEBHOOK_SIGNING_KEY
# 2. n8n Variables → SYD_WEBHOOK_SECRET
# 3. Riavvia entrambi i servizi
```

---

## Matrice di Responsabilità

| Workflow | Triggerato da | Aggiorna Firestore | Alert Canali |
|----------|--------------|-------------------|--------------|
| **Poller** | Schedule (5 min) | mark-notified flag | — |
| **Notify Admin** | Poller / Backend | — | Email + Telegram |
| **Deliver Quote** | Backend (approve) | status=quote_sent | Email + WhatsApp |
| **Error Handler** | Automatico (failure) | error-log collection | Email + Telegram |
