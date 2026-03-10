---
description: How to use Gemini CLI to delegate heavy file edit tasks and save tokens
---

# Gemini CLI Delegation Workflow

// turbo-all

Use when delegating large, single-file editing tasks to Gemini CLI to save Antigravity context tokens.
Best for: full file rewrites (>150 lines), large JSON generation, bulk prompt updates.

---

## ✅ Pattern 1 — Headless One-Shot (verified, ~30s)

```powershell
gemini --yolo --model gemini-3.1-pro-preview --allowed-mcp-server-names context7 -p "PROMPT" --output-format text 2>&1
```

**Prompt template:**
```
Sei un assistente di codice per SYD Bioedilizia (FastAPI + Next.js).
Workspace: contesto progetto disponibile via context7.
Fai ESATTAMENTE: [MODIFICA PRECISA].
Rispondi SOLO con il risultato. Nessun commento aggiuntivo.
```

> `WaitMsBeforeAsync: 45000` — MCP startup ~25s + risposta ~5s

---

## ✅ Pattern 2 — Stdin Pipe (per file grandi in input)

```powershell
Get-Content "path/to/file.py" | gemini --yolo --model gemini-3.1-pro-preview --allowed-mcp-server-names context7 -p "ISTRUZIONI SUL FILE" --output-format text 2>&1
```

---

## ✅ Pattern 3 — Interactive con prompt iniziale (`-i`)

Usa `-i` per eseguire un prompt iniziale e **poi restare interattivo** — ideale per task multi-step.

```powershell
# Step 1: Launch con prompt iniziale (WaitMsBeforeAsync: 15000)
gemini --approval-mode auto_edit --model gemini-3.1-pro-preview --allowed-mcp-server-names context7 -i "Sei il code assistant per SYD Bioedilizia. Workspace caricato. Attendi istruzioni."
```
Ottieni `CommandId` dal background process.

```powershell
# Step 2: Invia task via send_command_input (WaitMs: 30000+)
"Modifica il file src/services/foo.py: aggiungi il metodo bar()..."
```

---

## ✅ Pattern 4 — Resume Sessione Precedente (`--resume`)

Riprende una sessione Gemini CLI già esistente con il suo contesto. Molto più veloce.

```powershell
# Lista sessioni disponibili
gemini --list-sessions 2>&1

# Riprendi la più recente
gemini --approval-mode auto_edit --model gemini-3.1-pro-preview --allowed-mcp-server-names context7 --resume latest -i "Riprendi da dove eravamo. Task: [NUOVO TASK]"
```

---

## Approval Mode scelto per i task

| Scenario | Flag consigliato |
|----------|-----------------|
| Edit di file (sicuro) | `--approval-mode auto_edit` |
| Task completi con tool | `--yolo` |
| Solo lettura / pianificazione | `--approval-mode plan` |

---

## Quando usare CLI vs Edits Diretti

| Caso | CLI? | Motivo |
|------|------|--------|
| File rewrite >150 righe | ✅ Sì | Risparmio token |
| JSON/dati strutturati grandi | ✅ Sì | Large output |
| Edit multi-file coordinati | ❌ No | `multi_replace` più preciso |
| Edit <20 righe | ❌ No | Overhead non vale |
| Schema sync Pydantic → TS | ❌ No | Precisione richiesta |

---

## Troubleshooting

| Problema | Soluzione |
|----------|-----------|
| MCP errors nel log | Normali — ignorali |
| Processo non risponde | `send_command_input Terminate: true` |
| Output vuoto | Aggiungi `2>&1`, aspetta 45s+ |
| Modello non trovato | Usa esattamente `gemini-3.1-pro-preview` |
