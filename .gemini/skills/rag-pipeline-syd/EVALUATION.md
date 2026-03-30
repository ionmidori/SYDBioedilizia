# RAG Evaluation — Ragas + Gemini Judge

## Install

```bash
uv add ragas langchain-google-vertexai
```

## Test Set (30 queries — Prezzario Lazio 2023)

Save as `backend_python/tests/evals/rag_test_set.json`:

```json
[
  {"question": "Qual è il prezzo unitario per la demolizione manuale di muratura in mattoni?", "ground_truth": "Il prezzo unitario per la demolizione manuale di muratura è indicato nel capitolo 01 del Prezzario Lazio 2023."},
  {"question": "Quanto costa al metro cubo il calcestruzzo classe C25/30 in opera?", "ground_truth": "Il prezzo del calcestruzzo C25/30 è riportato nel capitolo strutture del Prezzario."},
  {"question": "Qual è l'unità di misura per la posa in opera di pavimenti in gres porcellanato?", "ground_truth": "L'unità di misura è il metro quadrato (mq)."},
  {"question": "Qual è il costo per la rimozione e smaltimento di materiali contenenti amianto?", "ground_truth": "Il Prezzario prevede voci specifiche per la bonifica amianto con smaltimento a norma."},
  {"question": "Codice articolo per la tinteggiatura a due mani di pareti interne?", "ground_truth": "La voce per tinteggiatura pareti interne è presente nel capitolo finiture del Prezzario Lazio."}
]
```

Add 25+ domain-specific questions covering: demolizioni, strutture, impianti, finiture, serramenti, isolamenti.

## Evaluation Script

`backend_python/scripts/eval_rag.py`:

```python
"""
Evaluate RAG pipeline quality using Ragas + Gemini as judge.
Run: uv run python scripts/eval_rag.py
"""
import json
import asyncio
from datasets import Dataset
from ragas import evaluate
from ragas.metrics import (
    faithfulness,
    answer_relevancy,
    context_precision,
    context_recall,
)
from langchain_google_vertexai import ChatVertexAI, VertexAIEmbeddings

# Load test set
with open("tests/evals/rag_test_set.json") as f:
    test_set = json.load(f)

# Run RAG pipeline on each question
async def generate_answers():
    from src.services.rag_service import retrieve_knowledge

    rows = []
    for item in test_set:
        chunks = await retrieve_knowledge(item["question"], top_k=6)
        context = [c["text"] for c in chunks]
        # Simple answer generation for eval (no need for full ADK pipeline)
        answer = context[0] if context else "Informazione non trovata."
        rows.append({
            "question": item["question"],
            "answer": answer,
            "contexts": context,
            "ground_truth": item["ground_truth"],
        })
    return rows

rows = asyncio.run(generate_answers())
dataset = Dataset.from_list(rows)

# Gemini as judge
llm = ChatVertexAI(
    model_name="gemini-2.5-flash-preview-04-17",
    project="chatbotluca-a8a73",
    location="europe-west1",
)
embeddings = VertexAIEmbeddings(
    model_name="text-multilingual-embedding-002",
    project="chatbotluca-a8a73",
)

result = evaluate(
    dataset,
    metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
    llm=llm,
    embeddings=embeddings,
)

print("\n=== RAG Evaluation Results ===")
print(result)
print(f"\nFaithfulness:      {result['faithfulness']:.3f}  (target: >0.85)")
print(f"Answer Relevancy:  {result['answer_relevancy']:.3f}  (target: >0.80)")
print(f"Context Precision: {result['context_precision']:.3f}  (target: >0.75)")
print(f"Context Recall:    {result['context_recall']:.3f}  (target: >0.70)")
```

## Passing Thresholds

| Metric | Minimum | Good |
|---|---|---|
| `faithfulness` | 0.80 | >0.90 |
| `answer_relevancy` | 0.75 | >0.85 |
| `context_precision` | 0.70 | >0.80 |
| `context_recall` | 0.65 | >0.75 |

If `context_precision` < 0.70 → chunks are too large or noisy → reduce chunk size or improve metadata filtering.
If `faithfulness` < 0.80 → LLM is hallucinating beyond retrieved context → tighten ADK agent prompt.

## Benchmark Comparison

Run eval on both indexes before swapping:

```bash
# Old index (dense only)
PINECONE_INDEX_NAME=syd-knowledge uv run python scripts/eval_rag.py > eval_v1.txt

# New index (hybrid)
PINECONE_INDEX_NAME=syd-knowledge-v2 uv run python scripts/eval_rag.py > eval_v2.txt

diff eval_v1.txt eval_v2.txt
```

Only deploy `syd-knowledge-v2` if all metrics improve or hold.
