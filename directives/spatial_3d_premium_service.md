# Project Brief: SYD Spatial 3D (Premium Service)

Questo documento definisce l'architettura e la strategia per un software autonomo dedicato alla ricostruzione 3D fotorealistica per l'architettura e il design d'interni.

## Obiettivo
Creare un'esperienza immersiva dove gli utenti possono trasformare video dello smartphone in modelli 3D "esplorabili" e navigabili nel browser.

## Stack Tecnologico Proposto

### 1. Nucleo di Elaborazione (Python/Backend)
- **Gaussian Splatting**: Utilizzo di implementazioni SOTA per la generazione di nuvole di punti fotorealistiche a 60 FPS.
- **Nerfstudio**: Engine per l'addestramento di NeRF ad alta fedeltà.
- **FastAPI**: Per gestire la coda di elaborazione (GPU Job Queue).

### 2. Frontend (Standalone Web Viewer)
- **Three.js / React-Three-Fiber**: Per il rendering dei file `.ply` o `.glb` generati.
- **WebXR**: Supporto per occhiali VR e AR mobile (vedere il modello nella propria stanza reale).

### 3. Infrastruttura GPU
- **Google Cloud Vertex AI** o **Custom GPU Nodes (NVIDIA A100)**: Necessarie per l'addestramento dei modelli (5-15 minuti per scena).

## Strategia di Monetizzazione (Premium)
- **Pay-per-Render**: Costo fisso per ogni ricostruzione 3D.
- **Subscription Professionale**: Accesso illimitato per architetti e designer con esportazione in formati CAD/BIM.

## Roadmap di Integrazione Futura
1.  **Standalone MVP**: Software separato che accetta video e restituisce link 3D.
2.  **Widget Integrazione**: Possibilità di incorporare il viewer 3D in qualsiasi sito (incluso il sito principale di SYD).
3.  **Sync con AI**: L'AI di SYD può "progettare" sopra il modello 3D generato, aggiungendo mobili e materiali virtuali.

---
*Documento creato il 23 Gennaio 2026 - Riferimento Visione Premium.*
