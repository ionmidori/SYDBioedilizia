# Idee per il Futuro (Roadmap Tecnica)

Questo documento raccoglie suggerimenti e strategie per l'evoluzione tecnica della piattaforma SYD Bioedilizia.

## 1. Ottimizzazione Video & Storage (GCP Transcoder API)
- **Concetto**: Spostare la compressione video su un servizio gestito di Google Cloud invece di gestirla nell'app.
- **Vantaggi**: 
    - Costo bassissimo ($0.015 - $0.060/min).
    - Riduzione occupazione storage del 60-80%.
    - Zero sovraccarico sulla CPU di Cloud Run.
- **Stato**: Ricerca completata (costi inclusi). Suggerito per quando il volume dei video aumenterà.

## 2. Vertex AI Agent Playbooks
- **Concetto**: Migrazione dalla logica custom LangGraph verso i nuovi "Playbooks" di Vertex AI.
- **Obiettivo**: Gestione più fluida degli intenti e riduzione della complessità del codice backend.

## 3. Migrazione Dominio (Domain Migration)
- **Obiettivo**: Passaggio a un dominio professionale dedicato per il branding definitivo della piattaforma.

---
_Ultimo aggiornamento: 23 Febbraio 2026_
