# Frontend Architectural Refactoring Plan

Questo documento delinea il piano d'azione dettagliato, suddiviso in task, per risolvere le criticità architetturali emerse dall'analisi del frontend (`web_client/`) in conformità con la "3-Tier Law", la "Golden Sync" e le best practice di Next.js App Router.

## Fase 1: Risoluzione Violazioni "3-Tier Law" (Chiamate DB Dirette)
- [x] **1.1.** Ispezionare `hooks/useFileUpload.ts` per individuare tutte le chiamate dirette a Firestore (es. `setDoc`, `updateDoc`, `addDoc`).
- [x] **1.2.** Progettare un nuovo endpoint FastAPI nel `backend_python` per gestire i metadati dell'upload dei file e generare Signed URL in modo sicuro.
- [x] **1.3.** Creare il modello Pydantic V2 nel backend per il payload di upload.
- [x] **1.4.** Aggiornare/Creare l'interfaccia TypeScript e lo schema Zod corrispondente nel frontend per rispettare la "Golden Sync".
- [x] **1.5.** Refattorizzare `useFileUpload.ts` per utilizzare TanStack Query (mutation) o fetch verso il nuovo endpoint backend, rimuovendo le scritture Firebase lato client.
- [x] **1.6.** Ispezionare `hooks/useUserPreferences.ts` per individuare scritture dirette sul database.
- [x] **1.7.** Progettare un endpoint FastAPI per l'aggiornamento delle preferenze utente.
- [x] **1.8.** Creare il modello Pydantic per le preferenze utente nel backend.
- [x] **1.9.** Creare lo schema Zod speculare nel frontend.
- [x] **1.10.** Refattorizzare le mutazioni in `useUserPreferences.ts` per delegare il salvataggio al backend Python.

## Fase 2: Ottimizzazione Next.js App Router (RSC & Performance)
- [x] **2.1.** Analizzare `app/dashboard/projects/page.tsx` per verificare l'uso della direttiva `"use client"` a livello root.
- [x] **2.2.** Estrarre la logica dipendente dallo stato e l'interattività da `projects/page.tsx` in componenti client dedicati (es. `components/projects/ProjectListClient.tsx`).
- [x] **2.3.** Rimuovere `"use client"` da `app/dashboard/projects/page.tsx` trasformandolo in un React Server Component (RSC) puro.
- [x] **2.4.** Implementare il data fetching iniziale lato server in `projects/page.tsx` passando i dati ai Client Components (se applicabile).
- [x] **2.5.** Eseguire una scansione globale (`grep`) su tutti i file `page.tsx` e `layout.tsx` in `app/` alla ricerca di direttive `"use client"` superflue.
- [x] **2.6.** Refattorizzare le pagine identificate isolando l'interattività esclusivamente nei componenti "foglia".
- [x] **2.7.** Verificare che i file `loading.tsx` esistenti implementino Skeleton UI ad alta fedeltà invece di semplici spinner, per migliorare le performance percepite.

## Fase 3: Pulizia Dipendenze e Gestione Stato
- [x] **3.1.** Eseguire `npm uninstall swr` all'interno della directory `web_client/`.
- [x] **3.2.** Verificare che il file `web_client/package.json` non contenga più riferimenti a `swr`.
- [x] **3.3.** Effettuare una ricerca globale nel codice frontend per assicurarsi che non ci siano import residui (`import ... from 'swr'`).
- [x] **3.4.** Eseguire un audit sull'utilizzo di TanStack Query per confermare che si stia usando la sintassi a oggetti raccomandata dalla v5.
- [x] **3.5.** Eseguire un audit sugli store Zustand per garantire che gestiscano esclusivamente lo stato globale della UI e non fungano da cache abusiva per i dati del server.

## Fase 4: Validazione "Golden Sync" (Contratti Dati)
- [x] **4.1.** Elencare tutti gli schemi Zod presenti in `web_client/lib/validation` e `web_client/types/`.
- [x] **4.2.** Elencare tutti i modelli Pydantic V2 in `backend_python/src/core/schemas.py` e relative cartelle di dominio.
- [x] **4.3.** Verificare la corrispondenza esatta (1:1) tra i modelli frontend e backend.
- [x] **4.4.** Redigere una lista delle discrepanze rilevate tra frontend e backend.
- [x] **4.5.** Allineare e correggere gli schemi frontend/backend per ripristinare la perfetta sincronia dei contratti.

## Fase 5: Revisione Architettura Real-time
- [x] **5.1.** Mappare tutti i punti nel frontend in cui viene utilizzato `onSnapshot` di Firebase (es. `useUserPreferences`).
- [x] **5.2.** Valutare tecnicamente la fattibilità di migrare questi flussi in tempo reale verso Server-Sent Events (SSE) o WebSockets gestiti da FastAPI, per rispettare al 100% la "3-Tier Law".
## Fase 6: Standardizzazione Accessibilità & Form (v3.6.06)
- [x] **6.1.** Creare primitive `components/ui/form.tsx` conformi allo standard Shadcn/UI (wrapping di `react-hook-form` e `zod`).
- [x] **6.2.** Refattorizzare `Navbar.tsx` per utilizzare `Sheet` (Radix UI) sia per il menu principale che per il `ContactMenu` (drawer), eliminando `framer-motion` custom per la logica di apertura.
- [x] **6.3.** Migrare `CreateProjectDialog.tsx` all'uso delle nuove primitive `Form` e `FormField`.
- [x] **6.4.** Migrare `RenameProjectDialog.tsx` all'uso delle nuove primitive `Form` e `FormField`.
- [x] **6.5.** Verificare la risoluzione dei warning console relativi ad `aria-hidden` e focus management.
- [x] **6.6.** Eseguire `npm run type-check` globale per validare la coerenza dei tipi nei form refattorizzati.
