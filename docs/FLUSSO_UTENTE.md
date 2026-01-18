# Flusso Utente: Dal Caricamento Media al Preventivo

Questo documento descrive le macro-fasi che l'utente attraversa interagendo con il chatbot SYD per ottenere un preventivo di ristrutturazione partendo da un input visivo (foto o video).

## 1. Fase di Ingresso (Input Visivo)
L'utente inizia l'interazione caricando un contenuto multimediale che rappresenta lo stato attuale dello spazio.
*   **Azione Utente:** Clicca sull'icona "Graffetta" e carica una foto (o video*) della stanza.
*   **Risposta AI:** Analizza istantaneamente l'immagine, riconoscendo elementi strutturali (pavimenti, finestre, materiali esistenti) e descrive ciò che vede per confermare la ricezione.
*   *Nota:* Attualmente l'upload diretto via chat supporta file immagine.

## 2. Fase di Indirizzamento (Disambiguazione)
L'AI deve capire subito l'obiettivo dell'utente per evitare flussi errati.
*   **Azione AI:** Chiede esplicitamente all'utente quale servizio desidera:
    *   🅰️ **Visualizzare (Rendering 3D):** Per chi cerca ispirazione estetica.
    *   🅱️ **Preventivare (Quote):** Per chi vuole conoscere i costi di realizzazione.
*   **Azione Utente:** Seleziona o digita "Preventivo" (o simili).

## 3. Fase Consulenziale (Intervista Tecnica)
Una volta scelto il preventivo, l'AI assume il ruolo di **Consulente Tecnico** (Surveyor Mode). Il sistema guida l'utente attraverso una serie di domande mirate (8-10 scambi) per raccogliere i dati necessari.

*   **Raccolta Visione:** "Cosa vuoi realizzare?" (es. open space, rimodernamento bagno).
*   **Raccolta Scope:** "Quali interventi sono previsti?" (es. demolizioni, impianti, solo finiture).
*   **Raccolta Misure:** "Dimensioni indicative dello spazio?" (mq o metri lineari).
*   **Raccolta Materiali:** "Preferenze per pavimenti/rivestimenti?" (es. gres, parquet, resina).

*Caratteristica Chiave:* L'AI adatta le domande in base alle risposte precedenti e a ciò che ha visto nella foto caricata in Fase 1.

## 4. Fase di Chiusura (Lead Generation)
Quando il quadro tecnico è completo, l'AI finalizza la richiesta.
*   **Richiesta Contatti:** L'AI chiede obbligatoriamente: Nome, Email e Telefono.
*   **Salvataggio:** I dati vengono strutturati e salvati nel database (Firestore) come "Lead Qualificato".
*   **Conferma:** L'utente riceve un messaggio di successo ("Dati salvati correttamente").

---
### Post-Flow (Cross-Selling)
Non appena il preventivo è salvato (Fase 4 completata), l'AI propone automaticamente il servizio complementare:
*"Ora che abbiamo i dettagli tecnici, vuoi vedere un'anteprima 3D del risultato?"*
Questo riporta l'utente alla Fase 2 (opzione A), chiudendo il cerchio dei servizi.
