# Piano Implementazione: Mascot Dinamica (Syd Robot)

**Obiettivo:** Trasformare l'attuale pulsante statico della chat in un "Robottino Vivente" che reagisce alle azioni dell'utente, elevando la UX al livello "Luxury Tech".

---

## 1. Strategia: "The Layered Puppet" (Il Burattino a Livelli)

Invece di adottare tecnologie pesanti come WebGL (Spline) o esterne come Rive in questa fase iniziale, utilizzeremo **Framer Motion** con una tecnica a "livelli" (Layered Puppet).

**Concetto:**
Il robot non sarà più un'unica immagine PNG piatta, ma un componente React composto da 3 parti sovrapposte che si muovono indipendentemente:
1.  **Corpo (Base):** Testa, torace, gambe.
2.  **Braccio Sinistro (Saluto):** Ruota per salutare quando l'utente è fermo.
3.  **Braccio Destro (Matita):** Appare e "scarabocchia" quando l'utente scrolla.

### Vantaggi:
*   **Performance:** Zero peso aggiuntivo (niente runtime 3D o WASM).
*   **Controllo Totale:** Possiamo collegare la velocità dello scroll alla velocità dell'animazione via codice.
*   **Rapidità:** Non serve un motion designer esterno; basta "ritagliare" l'immagine esistente.

---

## 2. Architettura Tecnica

### Componente: `DynamicRobot.tsx`
Utilizzeremo `framer-motion` per creare una "Macchina a Stati" visiva basata sulla fisica dello scroll.

#### Stati del Robot:
| Stato | Trigger | Comportamento Visivo |
| :--- | :--- | :--- |
| **IDLE (Riposo)** | `scrollVelocity == 0` | • Respiro lento (Body Scale Y) <br> • Braccio SX: Saluta (Loop) <br> • Braccio DX: Nascosto |
| **WORKING (Attivo)** | `scrollVelocity > 0` | • Corpo inclinato in avanti (Focus) <br> • Braccio SX: Nascosto <br> • Braccio DX: Disegna freneticamente <br> • Tavolozza/Foglio: Appare dal basso |

#### Hook Chiave:
```typescript
const { scrollY } = useScroll();
const scrollVelocity = useVelocity(scrollY);
// Trasforma la velocità in "frenesia" del disegno
const drawSpeed = useTransform(scrollVelocity, [0, 1000], [1, 5]);
```

---

## 3. Piano di Esecuzione

### Fase 1: Il "Cervello" (Codice)
Creiamo il componente `DynamicRobot` che accetta in input i pezzi del robot.
- [ ] Creare `web_client/components/ui/mascot/DynamicRobot.tsx`
- [ ] Implementare logica `useScroll` per rilevare "Stop" vs "Go".
- [ ] Configurare le varianti Framer Motion (`idle` vs `working`).

### Fase 2: Il "Corpo" (Asset)
Dobbiamo preparare gli asset grafici partendo da `syd_final_v9.png`.

**Checklist per Photoshop/Figma:**
1.  **Body.png:** Il robot *senza* le braccia (o con le braccia lungo i fianchi).
2.  **Arm_Wave.png:** Solo il braccio sinistro in posizione alzata.
3.  **Arm_Draw.png:** Solo il braccio destro che impugna una matita/penna.
4.  **Palette.png:** (Opzionale) Una tavolozza o un foglio blu (blueprint).

### Fase 3: Integrazione
- [ ] Sostituire `Image` in `ChatToggleButton.tsx` con `<DynamicRobot />`.
- [ ] Passare i nuovi asset come props.
- [ ] Testare la fluidità a 60fps su mobile.

---

## 4. Analisi Alternative (Per il Futuro)

Abbiamo valutato anche queste tecnologie per un eventuale upgrade "V2":

| Tecnologia | Pro | Contro | Voto |
| :--- | :--- | :--- | :--- |
| **Framer Motion (Scelta Attuale)** | Leggerissimo, Controllo React nativo, Zero costi. | Richiede asset "ritagliati" bene. | **9/10** |
| **Rive (App)** | Standard industriale per mascotte interattive (es. Duolingo). | Richiede learning curve del tool Rive e runtime WASM (~30KB). | **8.5/10** |
| **Spline (3D)** | Effetto "Wow" 3D reale. | Pesante per la batteria mobile. Rischio calo FPS durante lo scroll. | **7/10** |

---

## 5. Prossimi Passi
1.  **Conferma:** Se approvi questo piano, inizio a scrivere il codice della **Fase 1**.
2.  **Asset:** Mentre scrivo il codice, puoi (o posso provare io con strumenti base) separare le braccia del robot dall'immagine `syd_final_v9.png`.
