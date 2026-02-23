# FirestoreCheckpointer: Setup e Configurazione Avanzata

## Installazione

```bash
uv add langgraph-checkpoint-firestore
```

## Inizializzazione (con dependency injection)

```python
# src/graph/quote_factory.py
from langgraph_checkpoint_firestore import FirestoreSaver
from src.core.config import settings
from src.db.firebase_client import get_firestore_client

_checkpointer: FirestoreSaver | None = None

def get_quote_checkpointer() -> FirestoreSaver:
    """Singleton checkpointer per il Quote Graph."""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = FirestoreSaver.from_conn_info(
            project_id=settings.GOOGLE_CLOUD_PROJECT,
            checkpoints_collection="quote_graph_checkpoints",
            writes_collection="quote_graph_writes"
        )
    return _checkpointer
```

## Firestore Collections Create Automaticamente

Il checkpointer crea due collection:
- `quote_graph_checkpoints/{thread_id}/checkpoints/{checkpoint_id}` — stato del grafo serializzato
- `quote_graph_writes/{thread_id}/writes/{write_id}` — log write-ahead

**Regola Firestore** da aggiungere:
```javascript
match /quote_graph_checkpoints/{threadId=**} {
  allow read, write: if isAdmin();  // solo backend con Admin SDK
}
match /quote_graph_writes/{threadId=**} {
  allow read, write: if isAdmin();
}
```

## Thread ID Strategy

Il `thread_id` è la chiave di continuità del grafo. Usare sempre `project_id` come thread_id per il quote flow:

```python
config = {"configurable": {"thread_id": project_id}}
```

Questo garantisce che ogni progetto abbia esattamente UN checkpoint attivo.

## Leggere lo Stato Corrente (per Admin dashboard)

```python
state = await graph.aget_state(config)
print(state.values["ai_draft"])    # Output del QS
print(state.next)                  # Prossimo nodo da eseguire
print(state.metadata["step"])      # Step corrente
```

## Cleanup (dopo approvazione)

```python
async def cleanup_checkpoint(project_id: str):
    """Elimina il checkpoint dopo completamento (opzionale, per risparmio costi)."""
    db = get_firestore_client()
    checkpoints_ref = db.collection("quote_graph_checkpoints").document(project_id)
    await checkpoints_ref.delete()
```
