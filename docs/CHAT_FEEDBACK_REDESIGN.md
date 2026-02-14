# Chat Feedback Redesign: M3 Expressive Evolution

## 1. Analisi dello Stato Attuale
Attualmente, il feedback di "pensiero" è gestito nel componente `ChatMessages.tsx` (righe 80-97).
- **Implementazione**: Un blocco condizionale che mostra un `ArchitectAvatar` e un `ThinkingIndicator` all'interno di un container `bg-luxury-bg/80` con bordo dorato.
- **Problema**: È funzionale ma statico. Manca il "respiro" e la fluidità tipica del Material 3 Expressive. Sembra un messaggio chat standard invece di uno stato di sistema attivo.
- **Obiettivo**: Elevare l'esperienza visiva per comunicare che l'IA sta *lavorando* (ragionando, cercando, pianificando) in modo organico e ipnotico.

---

## 2. Principi di Motion Design (M3 Expressive)
1.  **Enfasi**: L'animazione deve attirare l'attenzione senza disturbare.
2.  **Risposta**: Il feedback deve essere immediato (<100ms) al submit dell'utente.
3.  **Fluidità**: Transizioni `spring` morbide (no linear).

---

## 3. Proposte di Design

### Concept A: "The Golden Pulse" (Minimalist Luxury)
*Un'onda sottile ed elegante che emana dall'avatar.*

*   **Visual**: L'avatar dell'Architetto non è statico ma "respira" con un'ombra dorata (`box-shadow`) pulsante. Accanto, invece di una bolla di testo, appare una linea d'onda (waveform) stilizzata che simula la voce/pensiero.
*   **Motion**:
    *   Avatar: `scale` tra 1 e 1.05 + `shadow-gold` pulsante.
    *   Indicatore: 3 barre verticali che variano in altezza casualmente (simulando attività neurale).
*   **Codice**: Nessuna rottura strutturale. Sostituzione pura del *contenuto* del `ThinkingIndicator`.

### Concept B: "The Morphing Surface" (M3 Standard)
*Una superficie che cambia forma in base allo stato.*

*   **Visual**: Una pillola di vetro (`glass-premium`) che parte piccola (solo icona "clessidra/scintilla") e si espande fluidamente in larghezza per mostrare il testo "Sto analizzando il progetto..." quando disponibile dai dati di Chain of Thought.
*   **Motion**: `layout` animation di Framer Motion. La larghezza è animata con una molla smorzata (`type: "spring", stiffness: 500, damping: 30`).
*   **Vantaggio**: Ottimo per mostrare i vari step ("Cercando file...", "Generando render...") senza scatti bruschi.

### Concept C: "The Ethereal Glow" (Cinematic - RACCOMANDATO)
*Un effetto di luce ambientale che suggerisce intelligenza.*

*   **Visual**: Nessun bordo solido. Il container ha uno sfondo sfumato ultra-sottile (`bg-gradient-to-r from-luxury-gold/5 via-transparent`) e un effetto "shimmer" che attraversa orizzontalmente il componente.
*   **Dettaglio**: Un piccolo "orb" (cerchio di 4px) dorato orbita o traccia il perimetro della card.
*   **Feeling**: "Jarvis" / High-Tech. Comunica potenza di calcolo.

---

## 4. Implementazione Chirurgica (Zero-Risk)

Per garantire la stabilità (non rompere il codice esistente), seguiremo questa strategia:

1.  **Nuovo Componente Isolato**: Creeremo `components/chat/ThinkingSurface.tsx`.
2.  **Props Interface**: Manterremo la stessa interfaccia di `ThinkingIndicator`:
    ```typescript
    interface ThinkingSurfaceProps {
      message?: string;
      statusMessage?: string;
      reasoningData?: any;
    }
    ```
3.  **Sostituzione Hot-Swap**: In `ChatMessages.tsx`, cambieremo solo l'import.
    *   *Vecchio*: `<ThinkingIndicator ... />`
    *   *Nuovo*: `<ThinkingSurface variant="ethereal" ... />`

## 5. Selezione Utente

Quale stile preferisci implementare?

1.  **Golden Pulse**: Classico, pulito, business-oriented.
2.  **Morphing Surface**: Dinamico, moderno, Google-style.
3.  **Ethereal Glow**: Futuristico, premium, "Wow" factor.
