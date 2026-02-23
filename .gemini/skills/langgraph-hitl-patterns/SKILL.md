---
name: langgraph-hitl-patterns
description: Implements Human-in-the-Loop (HITL) patterns for LangGraph stateful graphs. Covers FirestoreCheckpointer persistence, Soft Interrupt pattern (interrupt_before), admin approval flow, and Quantity Surveyor agent with structured output. Use when building multi-turn AI workflows that require human review, approval steps, or async resume-from-checkpoint behavior.
---

# LangGraph Human-in-the-Loop (HITL) Patterns

Covers: FirestoreCheckpointer, Soft Interrupt, Admin Resume, Quantity Surveyor Agent.

For deep dives: [FIRESTORE_CHECKPOINTER.md](FIRESTORE_CHECKPOINTER.md) | [QUANTITY_SURVEYOR.md](QUANTITY_SURVEYOR.md)

---

## Core: The Soft Interrupt + Resume Pattern

The canonical HITL pattern. The graph runs to an interrupt, persists state on Firestore, and resumes when the human approves.

```bash
uv add langgraph-checkpoint-firestore
```

```python
from langgraph_checkpoint_firestore import FirestoreSaver
from src.core.config import settings

def get_checkpointer() -> FirestoreSaver:
    return FirestoreSaver.from_conn_info(
        project_id=settings.GOOGLE_CLOUD_PROJECT,
        checkpoints_collection="langgraph_checkpoints",
        writes_collection="langgraph_writes"
    )
```

### Graph with interrupt_before

```python
from langgraph.graph import StateGraph, END
from typing import TypedDict, Literal

class QuoteState(TypedDict):
    project_id: str
    ai_draft: dict        # Output del Quantity Surveyor
    admin_decision: Literal["approve", "reject", "edit"] | None
    admin_notes: str

async def quantity_surveyor_node(state: QuoteState) -> dict:
    # ... analizza foto e chat, genera bozza SKU
    return {"ai_draft": draft}

async def admin_review_node(state: QuoteState) -> dict:
    # Nodo stub: il controllo torna all'API, grafo sospeso.
    return {}

async def finalize_node(state: QuoteState) -> dict:
    # ... approva, genera PDF, notifica n8n
    return {}

builder = StateGraph(QuoteState)
builder.add_node("quantity_surveyor", quantity_surveyor_node)
builder.add_node("admin_review", admin_review_node)
builder.add_node("finalize", finalize_node)
builder.set_entry_point("quantity_surveyor")
builder.add_edge("quantity_surveyor", "admin_review")
builder.add_conditional_edges(
    "admin_review",
    lambda s: "finalize" if s.get("admin_decision") == "approve" else END
)
builder.add_edge("finalize", END)

graph = builder.compile(
    checkpointer=get_checkpointer(),
    interrupt_before=["admin_review"]   # ← SOFT INTERRUPT
)
```

### FastAPI Endpoints (Phase 1 + Phase 2)

```python
@router.post("/quote/{project_id}/start")
async def start_quote_flow(project_id: str):
    """Fase 1: esegue fino all'interrupt, salva su Firestore."""
    config = {"configurable": {"thread_id": project_id}}
    await graph.ainvoke({"project_id": project_id, ...}, config)
    return {"status": "awaiting_admin_review"}

@router.post("/quote/{project_id}/approve")
async def approve_quote(project_id: str, body: AdminDecisionBody):
    """Fase 2: riprende dal checkpoint Firestore dopo approvazione admin."""
    config = {"configurable": {"thread_id": project_id}}
    await graph.aupdate_state(config, {
        "admin_decision": body.decision,
        "admin_notes": body.notes
    })
    result = await graph.ainvoke(None, config)   # None = riprendi
    return {"status": "completed", "result": result}
```

> **CRITICO**: `ainvoke(None, config)` riprende dall'ultimo checkpoint. Non passare lo stato iniziale.

---

## State Design Rules

- Usa `TypedDict` per `QuoteState`, mai `BaseModel` direttamente (LangGraph requirement)
- I campi opzionali dell'admin devono avere default `None` (e.g. `admin_decision: ... | None`)
- Non usare `MemorySaver` in produzione: sopravvive solo in-memory

## Common Gotchas

| Problema | Causa | Fix |
|---|---|---|
| Graph non si ferma | `interrupt_before` non impostato su compile | Aggiungere `interrupt_before=["admin_review"]` |
| Stato perso al restart | `MemorySaver` invece di `FirestoreSaver` | Migrare a `FirestoreSaver` |
| Resume fallisce | `ainvoke(initial_state, config)` sul resume | Usare `ainvoke(None, config)` |
| `admin_decision` non aggiornato | `update_state` non chiamato prima del resume | Chiamare `aupdate_state` PRIMA di `ainvoke(None, ...)` |
