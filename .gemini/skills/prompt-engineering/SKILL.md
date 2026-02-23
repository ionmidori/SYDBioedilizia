---
name: prompt-engineering
description: Master prompt design for Google Gemini models (1.5 Pro, 2.0 Flash). Includes patterns for Chain-of-Thought, few-shot learning, and long-context handling.
---

# Prompt Engineering Patterns (Gemini Edition)

Guide for designing, refining, and debugging complex prompts to maximize performance on Google Gemini models (1.5 Pro, 2.0 Flash, Ultra).

## When to Use This Skill
- Designing system instructions for Gemini
- Optimizing for large context windows (1M+ tokens)
- Implementing Chain-of-Thought (CoT) reasoning
- Refining few-shot examples for structured output
- Debugging inconsistent model behavior
- Reducing token verbosity while maintaining quality

## Core Competencies & Patterns

### 1. Chain-of-Thought (CoT) Avanzato
Per compiti logici complessi, forza il modello a esplicitare il ragionamento prima di rispondere.
- **Pattern Gemini:** Usa istruzioni come "Think step-by-step" o "Break down the problem".
- **Ottimizzazione:** Chiedi al modello di identificare premesse, passaggi intermedi e conclusioni in blocchi separati.

### 2. Few-Shot Learning con Esempi Strutturati
Gemini eccelle nell'apprendimento in-context.
- Fornisci esempi (shots) che coprano casi limite (edge cases).
- Usa separatori chiari (es. `---` o intestazioni Markdown) invece di pesanti tag XML nidificati se non strettamente necessari, per risparmiare token e migliorare la leggibilità.
- **Input:** Esempio sporco/complesso -> **Output:** Risposta ideale pulita.

### 3. System Instruction Optimization
Sposta le regole fisse dal prompt utente al System Prompt.
- Definisci chiaramente: Ruolo, Tono, Formato di Output, Vincoli (Positivi > Negativi).
- *Consiglio:* Gemini risponde meglio a istruzioni affermative ("Fai X") piuttosto che negative ("Non fare Y"). Trasforma i divieti in azioni alternative.

### 4. Long-Context Handling (Needle in a Haystack)
Sfrutta la finestra di contesto estesa di Gemini.
- Invece di RAG complessi, carica interi documenti nel contesto quando possibile.
- Posiziona le istruzioni critiche sia all'inizio che alla fine del prompt (Primacy & Recency effect).

### 5. Self-Correction & Iterative Refinement
Implementa loop di auto-critica.
- Pattern: "Genera una risposta. Poi, critica la tua risposta basandoti su [Criteri]. Infine, riscrivi la risposta migliorata."

## Antigravity Prompt Structure

Quando scrivi un prompt, segui questa struttura standardizzata:

```markdown
<system_instruction>
[Ruolo e Contesto Generale]
</system_instruction>

<task_description>
[Obiettivo specifico e passi da compiere]
</task_description>

<constraints>
[Lista puntata di vincoli di stile e lunghezza]
</constraints>

<examples>
[Input]: ...
[Output]: ...
</examples>
```

## Interaction Protocol

1. **Analisi:** Identifica il modello target (Flash per velocità, Pro/Ultra per ragionamento), l'input tipico e il formato desiderato.
2. **Drafting:** Genera una bozza iniziale seguendo la struttura sopra.
3. **Optimization:** Applica CoT o Few-Shot e spiega la scelta tecnica.

### Prompt Refinement Checklist
- [ ] Le istruzioni sono espresse in positivo ("Fai X")?
- [ ] Ci sono separatori chiari tra contesto e istruzioni?
- [ ] Gli esempi coprono i casi limite (edge cases)?
- [ ] La verbosità è minima senza perdere chiarezza?
