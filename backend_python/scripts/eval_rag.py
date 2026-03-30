"""
Evaluate RAG pipeline quality using Ragas + Gemini as judge.

Install deps first:
    uv add ragas langchain-google-vertexai

Run:
    cd backend_python
    uv run python scripts/eval_rag.py

Options:
    --namespace prezzario     # default: prezzario
    --top-k 6                 # chunks per query (default: 6)
    --test-set tests/evals/rag_test_set.json

Benchmark two indexes:
    PINECONE_INDEX_NAME=syd-knowledge uv run python scripts/eval_rag.py > eval_v1.txt
    PINECONE_INDEX_NAME=syd-knowledge-v2 uv run python scripts/eval_rag.py > eval_v2.txt
"""
import os
import sys
import json
import asyncio
import argparse
import logging
from pathlib import Path

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(message)s",
)
logger = logging.getLogger("EvalRAG")

# ── Dependency guard ──────────────────────────────────────────────────────────

try:
    from datasets import Dataset
    from ragas import evaluate
    from ragas.metrics import (
        faithfulness,
        answer_relevancy,
        context_precision,
        context_recall,
    )
    from langchain_google_vertexai import ChatVertexAI, VertexAIEmbeddings
except ImportError as e:
    logger.error(
        f"Missing dependency: {e}\n"
        "Install with:\n"
        "    uv add ragas langchain-google-vertexai datasets\n"
        "Then retry."
    )
    sys.exit(1)


# ── Answer generation ─────────────────────────────────────────────────────────

async def generate_answers(
    test_set: list[dict],
    namespace: str,
    top_k: int,
) -> list[dict]:
    """Run RAG retrieval + simple answer generation for each test question."""
    from src.services.rag_service import RAGService
    from src.core.config import settings
    from google import genai
    from google.genai import types

    rag = RAGService()
    if not rag.index:
        logger.error("RAGService not initialized. Check PINECONE_API_KEY.")
        sys.exit(1)

    client = genai.Client(api_key=settings.api_key)

    rows = []
    for i, item in enumerate(test_set):
        question = item["question"]
        ground_truth = item["ground_truth"]
        logger.info(f"[{i+1}/{len(test_set)}] {question[:80]}...")

        # Retrieve chunks
        results = await rag.search(query=question, top_k=top_k, namespace=namespace)
        contexts = [
            r["metadata"].get("chunk_text", r["metadata"].get("text", ""))
            for r in results
            if r.get("metadata")
        ]

        if not contexts:
            logger.warning(f"  → No context retrieved for question {i+1}")
            contexts = ["Informazione non trovata."]
            answer = "Informazione non trovata nel Prezzario."
        else:
            # Generate answer from retrieved context using Gemini
            context_text = "\n\n".join(contexts[:3])
            prompt = (
                f"Rispondi alla seguente domanda usando SOLO le informazioni fornite.\n\n"
                f"CONTESTO:\n{context_text}\n\n"
                f"DOMANDA: {question}\n\n"
                f"RISPOSTA (breve, in italiano):"
            )
            try:
                response = client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=prompt,
                    config=types.GenerateContentConfig(temperature=0.0),
                )
                answer = response.text.strip()
            except Exception as e:
                logger.error(f"  → Gemini answer generation failed: {e}")
                answer = contexts[0][:200]

        logger.info(f"  → {len(contexts)} chunks retrieved. Answer: {answer[:80]}...")

        rows.append({
            "question": question,
            "answer": answer,
            "contexts": contexts,
            "ground_truth": ground_truth,
        })

    return rows


# ── Evaluation ────────────────────────────────────────────────────────────────

def run_evaluation(rows: list[dict], project_id: str, location: str) -> dict:
    """Run Ragas evaluation with Gemini as judge."""
    dataset = Dataset.from_list(rows)

    llm = ChatVertexAI(
        model_name="gemini-2.5-flash-preview-04-17",
        project=project_id,
        location=location,
    )
    embeddings = VertexAIEmbeddings(
        model_name="text-multilingual-embedding-002",
        project=project_id,
        location=location,
    )

    logger.info(f"Running Ragas evaluation on {len(rows)} samples...")
    result = evaluate(
        dataset,
        metrics=[faithfulness, answer_relevancy, context_precision, context_recall],
        llm=llm,
        embeddings=embeddings,
    )
    return result


# ── Report ────────────────────────────────────────────────────────────────────

THRESHOLDS = {
    "faithfulness":       {"min": 0.80, "good": 0.90},
    "answer_relevancy":   {"min": 0.75, "good": 0.85},
    "context_precision":  {"min": 0.70, "good": 0.80},
    "context_recall":     {"min": 0.65, "good": 0.75},
}


def print_report(result: dict) -> bool:
    """Print evaluation report. Returns True if all minimums pass."""
    print("\n" + "="*60)
    print("RAG EVALUATION RESULTS — SYD Bioedilizia / Prezzario Lazio 2023")
    print("="*60)

    all_pass = True
    for metric, thresholds in THRESHOLDS.items():
        score = result.get(metric, 0.0)
        if score is None:
            score = 0.0
        status = "PASS" if score >= thresholds["min"] else "FAIL"
        quality = "GOOD" if score >= thresholds["good"] else ""
        if status == "FAIL":
            all_pass = False
        flag = f"[{status}]{' ' + quality if quality else ''}"
        print(f"  {metric:<22} {score:.3f}   (min: {thresholds['min']:.2f}, good: {thresholds['good']:.2f})  {flag}")

    print("="*60)
    print(f"\nOverall: {'ALL PASS ✓' if all_pass else 'FAILED — see diagnostics below'}")

    if not all_pass:
        print("\nDiagnostics:")
        if result.get("context_precision", 1.0) < 0.70:
            print("  - context_precision < 0.70: chunks too large or noisy")
            print("    → reduce chunk size or improve metadata filtering")
        if result.get("faithfulness", 1.0) < 0.80:
            print("  - faithfulness < 0.80: LLM generating beyond retrieved context")
            print("    → tighten ADK agent prompt or use stricter answer generation")
        if result.get("context_recall", 1.0) < 0.65:
            print("  - context_recall < 0.65: relevant chunks not being retrieved")
            print("    → increase top_k, improve chunking, or add BM25 hybrid search")

    return all_pass


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Evaluate SYD RAG pipeline with Ragas")
    parser.add_argument("--namespace", default="prezzario", help="Pinecone namespace")
    parser.add_argument("--top-k", type=int, default=6, help="Chunks per query")
    parser.add_argument(
        "--test-set",
        default="tests/evals/rag_test_set.json",
        help="Path to test set JSON",
    )
    parser.add_argument(
        "--project",
        default="chatbotluca-a8a73",
        help="GCP project ID for Vertex AI judge",
    )
    parser.add_argument(
        "--location",
        default="europe-west1",
        help="GCP region for Vertex AI",
    )
    parser.add_argument(
        "--save",
        default=None,
        help="Save results to JSON file (e.g. tests/evals/results/eval_v1.json)",
    )
    args = parser.parse_args()

    test_set_path = Path(args.test_set)
    if not test_set_path.exists():
        logger.error(f"Test set not found: {test_set_path}")
        sys.exit(1)

    with open(test_set_path, encoding="utf-8") as f:
        test_set = json.load(f)

    logger.info(f"Loaded {len(test_set)} test questions from {test_set_path}")
    logger.info(f"Namespace: {args.namespace}, top_k: {args.top_k}")

    # Run retrieval + generation
    rows = asyncio.run(generate_answers(test_set, args.namespace, args.top_k))

    # Run Ragas evaluation
    result = run_evaluation(rows, args.project, args.location)

    # Print report (also captured when redirecting to file)
    passed = print_report(result)

    # Save results
    if args.save:
        save_path = Path(args.save)
        save_path.parent.mkdir(parents=True, exist_ok=True)
        with open(save_path, "w", encoding="utf-8") as f:
            json.dump(
                {
                    "scores": {k: float(v) if v is not None else None for k, v in result.items()},
                    "thresholds": THRESHOLDS,
                    "passed": passed,
                    "namespace": args.namespace,
                    "top_k": args.top_k,
                    "n_questions": len(test_set),
                },
                f,
                indent=2,
                ensure_ascii=False,
            )
        logger.info(f"Results saved to {save_path}")

    sys.exit(0 if passed else 1)


if __name__ == "__main__":
    main()
