# Redesign Area Personale e Sidebar: Material 3 Expressive

Questo documento descrive le specifiche tecniche e stilistiche per il redesign completo dell'**Area Personale** (ex Dashboard) e della Sidebar, adottando il linguaggio **Material 3 Expressive** (M3X) e il **Glassmorphism**.

## 1. Sidebar Redesign (Glassmorphism & Swarm Navigation)

### 1.1 Stile e Materiali
- **Tipografia (Font Ufficiali)**:
  - **Headers Luxury**: `Playfair Display` (Serif - `--font-serif`).
  - **Brand & Accent**: `Cinzel` (Trajan style - `--font-trajan`).
  - **UI & Navigation**: `Outfit` (`--font-outfit`) o `Lato` (`--font-sans`).
- **Materiale Base**: `glass-sidebar` (definito in `globals.css`).
  - Background: `rgba(15, 23, 42, 0.65)` (Dark Luxury).
  - Blur: `backdrop-filter: blur(16px) saturate(180%)`.
  - Bordo: `1px solid rgba(233, 196, 106, 0.1)` (Gold sottile).
- **Animazioni**: Framer Motion per transizioni width (80px -> 280px) con easing M3 `emphasized`.

### 1.2 Layout "User Hub" (Top Section)
Riorganizzazione radicale della parte superiore della sidebar per un accesso immediato alle azioni utente.
- **Container**: Padding unificato, separato visivamente dal resto.
- **Profilo**: Avatar circolare + Nome Utente (font `Trajan` o Serif per il brand).
- **Azioni Rapide**: Sotto il profilo, due pulsanti icon-only minimali:
  - 🌍 **Home**: Torna al sito pubblico.
  - 🚪 **Logout**: Disconnessione.
  - *Stile*: `ghost` button, opacity 70% -> 100% on hover.

### 1.3 Navigazione (Middle Section)
Divisa in due cluster logici per ridurre il carico cognitivo.

**A. Primary Navigation (Livello Piattaforma)**
- **Bacheca** (ex Dashboard/Area Personale): Panoramica attività.
- **Galleria Globale**: Accesso a tutti i render e file.
- **Progetti**: Lista completa/archivio.

**B. Active Project Context (Livello Cantiere)**
*Visibile solo quando si è dentro un progetto (`/dashboard/[id]`).*
- *Header*: "CANTIERE ATTIVO" (Antetitolo 10px uppercase tracking-widest gold).
- **Cantiere AI**: Chat e Agenti.
- **Galleria**: File specifici del progetto.
- **Settaggi**: Configurazione parametri progetto.
- *Nota*: Nessun Footer/Credits in questa modalità per massimizzare lo spazio verticale.

### 1.4 Notch Toggle (Draggable & Adaptive)
- **Funzionalità Unica**: Il bottone Toggle/Menu *interno* è rimosso. L'unica interazione è il **Notch**.
- **Posizionamento Dinamico**: Il Notch deve essere **trascinabile** verticalmente (come l'attuale implementazione FAB) per adattarsi alla presa dell'utente su qualsiasi device.
- **Compatibilità Mobile**:
  - `touch-action: none` sul Notch per prevenire scroll indesiderati durante il trascinamento.
  - Dimensioni minime touch target (48x48px) anche se visivamente più piccolo.
  - Test accurato su **iOS Safari** (gestione bounce/overscroll) e **Android Chrome**.
- **Stile**: Accento Gold, forma semicieca (Half-Pill) ancorata al bordo.

---

## 2. Dashboard Redesign (M3 Expressive Grid)

L'obiettivo è trasformare la dashboard da una "lista di card" a una **Command Console** operativa.

### 2.1 Grid Layout & Responsive
- **Masonry Grid / Bento Box**: Abbandonare la lista verticale per una griglia modulare.
- **Breakpoints**:
  - Mobile: Single column (Stack).
  - Tablet: 2 columns.
  - Desktop: 3/4 columns (Bento Grid).

### 2.2 Componenti Chiave

#### A. Welcome Hero (Header)
- **Visual**: Grande tipografia Serif (`Playfair Display` - "Buongiorno, *Nome*").
- **Motion**: Entrata scaglionata (`staggerChildren`).
- **Data**: Data odierna in formato elegante (es. "14 FEB • VENERDÌ").
- **Subtitles**: Testo in `Lato` o `Outfit` con opacità al 50%.

#### B. Quick Actions (FAB Row)
- Trasformare la riga di azioni in **Surface Cards** interattive:
  - **Nuovo Progetto**: Card primaria (Gold accent), grande.
  - **Carica File / Rilievo**: Card secondarie (Surface Container), medie.
- *Effetto*: Hover `elevation-3` + `scale(1.02)`.

#### C. Project Cards (M3 Elevated)
Refactoring di `ProjectCard.tsx` per allinearsi a M3:
- **Container**: `Surface Container Low` (grigio scuro/blu notte) -> `Surface Container High` (hover).
- **Shape**: `rounded-[24px]` (Extra Large).
- **Thumbnail**: Aspect ratio 3:2, angoli arrotondati interni.
- **Typography**: Titolo in `Playfair Display` (o font brand), dettagli in `Inter` (o sans).
- **Status Badge**: Pillola a pillola (Pill shape), colori pastello su sfondo scuro.

#### D. Stats Modules
- Card compatte e quadrate per i numeri chiave.
- Numeri grandi (Display Large), etichette piccole.

### 2.3 Motion System & Touch Handling
- **Entrata**: Ogni elemento della dashboard entra in sequenza (Hero -> Actions -> Projects).
- **Interazione**: Le card reagiscono al tocco (Mobile) e al cursore (Desktop) con micro-parallax o bagliori (Glow).
- **Gestione Swipe (Disabilitato)**:
  - **Sidebar**: Nessun supporto swipe. Apertura ESCLUSIVA tramite click sul **Notch** o bottone Toggle.
  - **Caroselli (Bacheca)**: Scroll orizzontale touch nativo.
  - **Page Switch**: Transizioni di pagina fluide (Exit/Enter) con `AnimatePresence`.

## 3. Piano di Implementazione
1. **Sidebar**: Refactoring strutturale `AppSidebar.tsx` (Glass + User Hub + Notch).
2. **Dashboard Layout**: Creazione nuovo layout a griglia (`StatsGrid` + `BentoGrid`).
3. **Card Redesign**: Aggiornamento `ProjectCard.tsx` con nuovi token M3.
4. **Motion Polish**: Applicazione varianti `framer-motion` coordinate.
