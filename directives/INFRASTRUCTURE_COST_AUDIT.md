# Audit Stima Costi Infrastruttura: SYD Bioedilizia

Questo documento delinea i costi operativi stimati per la piattaforma SYD Bioedilizia basati sull'attuale architettura a 3 livelli (Next.js + FastAPI + Google Cloud/Firebase).
**Aggiornamento**: Include i costi per il nuovo motore **CAD Digitization (Gemini 1.5 Pro)** e **Market Intelligence (Perplexity)**.

## 1. Assunzioni del Modello (User Profiling)
Per ogni utente attivo al mese, ipotizziamo il seguente comportamento medio:
- **Interazioni Chat (AI Reasoning)**: 30 messaggi (input/output ~2.500 token totali per interazione).
- **Generazione Immagini (Rendering)**: 2 rendering fotorealistici (Imagen 3).
- **Digitazione Planimetrie (CAD)**: 1 upload planimetria cartacea/mese (Gemini 1.5 Pro Vision).
- **Ricerche di Mercato (Perplexity)**: 5 query/mese (Analisi prezzi materiali in tempo reale).
- **Dati Archiviati**: 50 MB (foto caricate + documenti DXF).

---

## 2. Analisi dei Costi Mensili (Proiezioni)

| Servizio | Componente | 100 Utenti | 500 Utenti | 1.000 Utenti | Costo Unitario/Note |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Gemini 2.5 Flash** | AI Reasoning | €0.80 | €4.00 | €8.00 | $0.10/1M tokens (Input). Molto economico. |
| **Gemini 1.5 Pro** | **CAD Engine** | €2.50 | €12.50 | €25.00 | ~$0.025 per analisi planimetria (Vision + Complex JSON). |
| **Imagen 3** | Rendering Foto | €8.00 | €40.00 | €80.00 | ~$0.04 per generazione HQ. |
| **Perplexity Sonar** | Market Data | €2.50 | €12.50 | €25.00 | ~$0.005 per query (Online). |
| **Firebase App Check** | Security | €0.00 | €0.00 | €0.00 | Gratis fino a 10k verifiche/mese (poi $1/1k). |
| **Google Cloud Run** | Backend | €0.50 | €2.50 | €5.00 | vCPU on-demand. Coperto parzialmente dal Free Tier. |
| **Firebase Storage** | Media Hosting | €0.00 | €0.00 | €0.15 | Gratis fino a 5GB. |
| **TOTALE STIMATO** | | **€14.30** | **€71.50** | **€143.15** | |
| **COSTO PER UTENTE** | | **€0.14** | **€0.14** | **€0.14** | **Margine Lordo > 98%** (su sub €10/mese) |

---

## 3. Ripartizione Strategica & Rischi

### 🛑 Driver di Costo Principale: Rendering & Vision
Il **55% del budget** è assorbito dalla generazione di immagini (Imagen 3) e dall'analisi planimetrie (Gemini 1.5 Pro).
- **Strategia**: Questi tool devono essere "Premium Features" o limitati a token mensili.
- **Rischio**: Un utente che carica 50 planimetrie in un giorno può erodere il margine. Implementare Rate Limiting rigoroso su `/api/vision/analyze`.

### ⚡ AI Reasoning (Flash): Irrilevante (< 5%)
Grazie a **Gemini 2.5 Flash**, l'intelligenza conversazionale ha un costo trascurabile. Possiamo incentivare chat lunghe per aumentare l'engagement senza temere la bolletta.

### 🛡️ Security (App Check)
Con 1.000 utenti attivi, potremmo avvicinarci alla soglia delle 10.000 verifiche/mese (considerando refresh token e chiamate multiple).
- **Impatto**: Se superiamo la soglia, il costo è $1 per 1.000 verifiche aggiuntive.
- **Mitigazione**: Ottimizzare la durata del token App Check (TTL) per ridurre le chiamate a Google.

---

## 4. Scalabilità Economica
- **Modello SaaS**: Se vendiamo l'abbonamento PRO a **€9.99/mese**, il Break-Even Point (BEP) per i costi infrastrutturali è irrisorio (basta 1 utente pagante per coprire ~70 utenti free).
- **Marginalità**: Il costo marginale per aggiungere un utente è **€0.14/mese**. Questo rende il modello di business estremamente scalabile.

## 5. Conclusione
L'architettura è **finanziariamente solida**. L'introduzione di Gemini 1.5 Pro per il CAD alza leggermente il costo medio (+€0.025/utente), ma aggiunge un valore commerciale enorme (Lock-in effect).

---
> [!TIP]
> **Action Item**: Monitorare quotidianamente il consumo di **Gemini 1.5 Pro**. Se il volume di upload planimetrie esplode, valutare il passaggio a modelli Vision più piccoli o quantizzati per la pre-analisi.
