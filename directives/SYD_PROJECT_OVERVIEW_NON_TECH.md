# 🏗️ SYDBioedilizia: Quando l'Intelligenza Artificiale Indossa il Caschetto

## Cos'è SYD?
Immaginate di avere un architetto, un ingegnere strutturista, un interior designer e un computista sempre in tasca, pronti a lavorare simultaneamente sul vostro progetto 24/7. SYDBioedilizia non è un semplice "chatbot" che dà consigli generici. È una piattaforma **Enterprise AI-Native** che trasforma una semplice foto scattata col cellulare in un progetto di ristrutturazione esecutivo, completo di preventivi reali e file tecnici.

Abbiamo preso il caos del cantiere e lo abbiamo ordinato con il codice.

---

## � La Filosofia: Edilizia Sana e Consapevole
SYD non ti aiuta solo a costruire, ma a costruire **bene**. Il nostro focus è la **Bioedilizia**:
*   **Materiali Vivi**: Consigliamo materiali che "respirano" (legno, canapa, calce naturale) per migliorare la qualità dell'aria.
*   **Efficienza Energetica**: Analizziamo la tua casa per ridurre le bollette e l'impatto ambientale.
*   **Salute al Centro**: Eliminiamo muffe e umidità alla radice, creando ambienti sani per la famiglia.

---

## 🧠 Il Backend: Una "Sinfonia" di Agenti Intelligenti
La vera magia avviene nel "dietro le quinte". Non abbiamo creato un'unica intelligenza artificiale che cerca di fare tutto, ma una **Architettura a Sciame (Swarm Architecture)** basata su Python.

### 1. Il Direttore d'Orchestra (The Orchestrator)
Al centro di tutto c'è un sistema avanzato basato su grafi decisionali (**LangGraph**). Un "Agente Supervisore" analizza le tue richieste e decide chi attivare:
*   Serve un design? Chiama l'agente **Architect**.
*   Serve un prezzo? Attiva l'agente **Quantity Surveyor**.
*   C'è un problema tecnico? Chiama l'agente **Engineer**.
Questo flusso impedisce all'AI di "allucinare": un designer non proverà mai a calcolare il cemento armato.

### 2. Occhi Bionici: Agentic Vision e Motore CAD
Il sistema non si limita a "guardare" una foto. Utilizziamo **Gemini 3 Flash** per:
*   **Analisi dei Materiali**: Riconoscere se un pavimento è in gres o parquet, rilevare umidità o il tipo di infissi.
*   **Il Motore CAD**: Abbiamo sviluppato un algoritmo che traduce i pixel della foto in vettori geometrici, generando file **DXF** (usati dai professionisti su AutoCAD) partendo anche solo da uno schizzo.

### 3. Memoria Eidetica e Contesto Infinito
SYD utilizza la finestra di contesto estesa di **Gemini 2.5** per caricare interi manuali tecnici e normative edilizie. Se chiedi un preventivo, il sistema incrocia i tuoi dati con listini reali e vincoli legali, garantendo risposte fattibili e certificate.

### 4. Il "Buttafuori" dei Dati (Safety Layer)
Ogni singolo dato generato dall'AI viene intercettato da un livello di validazione rigoroso (**Pydantic**). Se l'AI suggerisce un valore incoerente (es. un muro spesso 0 cm), il sistema blocca l'errore e costringe l'AI a ricalcolare, garantendo dati sempre puliti e sicuri.

---

## �️ Il Frontend: Un'Esperienza "Liquida" e Indistruttibile
Sviluppato in **Next.js 15**, il frontend è il corpo elegante che interagisce con l'utente.

*   **Interfaccia Resiliente (Crash-Proof)**: Progettata con filosofia difensiva. Se un dato è incompleto, l'app non mostra mai la "schermata bianca" (errore), ma si adatta mostrando placeholder o dati parziali.
*   **Design Emozionale**: Usiamo effetti visivi moderni (**Glassmorphism**) e transizioni fluide.
*   **Feedback Istantaneo**: Grazie agli "Aggiornamenti Ottimistici", l'app risponde istantaneamente mentre il server sincronizza i dati complessi in background.

---

## ☁️ L'Infrastruttura: La Cassaforte Digitale
Tutto gira sull'ecosistema **Google Cloud / Firebase**:
*   **Sicurezza Militare**: Ogni foto e preventivo è protetto da regole d'accesso granulari.
*   **Database Real-time**: Le modifiche sul telefono sono visibili istantaneamente sul PC del partner o dell'architetto.
*   **App Check**: Un sistema di sicurezza che verifica l'autenticità di ogni interazione, proteggendo il progetto da intrusioni.

---

## ✨ Perché SYD è Diverso?
La maggior parte delle app AI sono semplici "facciate" per ChatGPT. **SYDBioedilizia agisce sul mondo fisico**. Vede lo spazio, calcola misure, disegna planimetrie tecniche e stima i costi reali. 

È un ponte tra il sogno di una casa nuova e la realtà del cantiere, costruito con un codice solido quanto il cemento armato e destinato a diventare un **Blueprint ufficiale per Google Project IDX**.

---

**SYD Bioedilizia**: *Semplice. Intelligente. Umano.*
