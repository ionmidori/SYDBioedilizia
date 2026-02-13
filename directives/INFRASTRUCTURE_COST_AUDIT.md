# Audit Stima Costi Infrastruttura: SYD Bioedilizia

Questo documento delinea i costi operativi stimati per la piattaforma SYD Bioedilizia basati sull'attuale architettura a 3 livelli (Next.js + FastAPI + Google Cloud/Firebase) per volumi di traffico crescenti.

## 1. Assunzioni del Modello (User Profiling)
Per ogni utente attivo al mese, ipotizziamo il seguente comportamento medio:
- **Interazioni Chat (AI Reasoning)**: 15 messaggi (input/output ~2.500 token totali per interazione).
- **Generazione Immagini (Rendering)**: 2 rendering fotorealistici (Imagen 3).
- **Ricerche di Mercato (Perplexity)**: Media di 3 query/mese (Limite rigido: 2 query/giorno per progetto).
- **Dati Archiviati**: 25 MB (foto caricate + documenti).

---

## 2. Analisi dei Costi Mensili (Proiezioni)

| Servizio | Componente | 100 Utenti | 300 Utenti | 500 Utenti | Note |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Google Gemini 2.5 Flash** | AI Reasoning | €0.40 | €1.20 | €2.00 | Basato su $0.10/1M token. |
| **Google Imagen 3** | Rendering Foto | €8.00 | €24.00 | €40.00 | ~€0.04 per generazione. |
| **Perplexity API** | Market Data | €1.50 | €4.50 | €7.50 | Media stimata di 3 query/utente/mese. |
| **Google Cloud Run** | Backend Compute | €0.00 | €0.15 | €0.50 | Coperto quasi interamente dal Free Tier. |
| **Firebase Firestore** | Database Ops | €0.00 | €0.00 | €0.00 | Sotto la soglia di 50k read/giorno (Gratis). |
| **Firebase Storage** | Media Hosting | €0.00 | €0.00 | €0.00 | Sotto i 5GB (Gratis). |
| **Vercel** | Frontend Hosting | €0.00 | €0.00 | €0.00 | Sotto i limiti di banda (Hobby/Pro). |
| **TOTALE STIMATO** | | **€10.90** | **€32.85** | **€55.00** | |
| **COSTO PER UTENTE** | | **€0.11** | **€0.11** | **€0.11** | |

---

## 3. Ripartizione Strategica dei Costi

### Gestione Quote Perplexity (Limiti Rigidi)
Il sistema implementa un blocco lato server per controllare i costi:
- **Limite**: 2 ricerche/giorno per progetto.
- **Costo Max Teorico**: Se un utente esaurisse la quota ogni giorno (60 ricerche/mese), il costo per quell'utente salirebbe a **€0.30/mese**.
- **Impatto sul Budget**: Anche nello scenario "Peccatore Seriale" (tutti gli utenti usano la quota max), il costo per 500 utenti per Perplexity sarebbe di **€150**, mantenendo il costo totale per utente sotto i **€0.40**.

### AI Rendering (Imagen 3): ~73% del Budget
La generazione di immagini è il driver principale di costo. 
- **Ottimizzazione**: Implementare un sistema di "crediti" o limitare i render gratuiti per utente.

### AI Reasoning (Gemini 2.5 Flash): ~4% del Budget
L'intelligenza "logica" è incredibilmente economica. Possiamo permetterci conversazioni molto lunghe e dettagliate senza impatti economici rilevanti.

### API Perplexity: ~24% del Budget
Cruciale per avere dati in tempo reale.
- **Ottimizzazione**: Implementare il caching delle ricerche (es. se due utenti cercano "Prezzo legno canapa" nello stesso giorno, la seconda query è gratis).

---

## 4. Scalabilità e Limiti
- **Fino a 1.000 Utenti**: L'infrastruttura Google Cloud scala automaticamente. I costi rimarranno lineari (~€0.11/utente).
- **Soglie Critiche**: Superata la soglia dei 5GB di Firebase Storage (oltre 1.000 utenti/progetti attivi), si inizierà a pagare circa €0.026/GB/mese.

## 5. Conclusione
L'architettura attuale è **altamente sostenibile**. Con un costo operativo di circa **11 centesimi per utente**, SYD Bioedilizia ha margini di profitto eccellenti se posizionata come servizio SaaS Premium o come strumento di lead generation per aziende edili.

---
> [!TIP]
> Per ridurre ulteriormente i costi iniziali, si può valutare l'uso di modelli "open-source" ospitati internamente, ma al volume attuale (500 utenti), la comodità e la qualità delle API Google sono imbattibili.
