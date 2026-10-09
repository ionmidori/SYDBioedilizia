"""
A/B quality comparison of two chat configurations (LLM-as-judge).

Input: two JSON files written by `chat_latency_bench.py --out` against the same
scenarios, one per configuration (e.g. current models vs candidate models).
Each pair of answers (same scenario / run / turn) is judged blind: the order is
randomized per pair to cancel position bias, and the judge scores both answers
on SYD's rules, then states a preference.

Usage (from backend_python/):
    uv run python scripts/chat_quality_ab.py bench_a.json bench_b.json --out ab.json

The judge model is resolved from the registry (MODEL_QUOTE by default, the
strongest configured role); override with --judge-role.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import random
import sys
from collections import Counter

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env"))

from google.genai import types  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402

from src.core.models import ModelRole, get_genai_client, get_model_id  # noqa: E402

JUDGE_INSTRUCTIONS = """Sei un revisore esperto di assistenti conversazionali.
Valuti le risposte di "Syd", l'assistente di SYD Bioedilizia (impresa di ristrutturazioni a Roma).
Cosa sa fare Syd (sono capacità reali, non penalizzarle): genera rendering fotorealistici
delle stanze partendo da una foto, prepara preventivi di ristrutturazione, consulta il listino
interno dell'impresa e il Prezzario Regione Lazio 2023, chiede il login per le funzioni premium.
Regole del prodotto che Syd deve rispettare:
- risponde sempre in italiano, tono professionale e cordiale;
- si occupa di ristrutturazioni edilizie: non preventiva mobili o elettrodomestici;
- non inventa prezzi: i prezzi vengono dal listino o dal Prezzario, altrimenti lo dice;
- fa una domanda alla volta;
- è utile e concreto, fa domande di chiarimento quando servono, senza prolissità.

Valuta ciascuna risposta (X e Y) da 1 a 5 su:
- helpfulness: quanto risponde davvero alla domanda in modo utile e corretto;
- rules: quanto rispetta le regole del prodotto sopra;
- clarity: chiarezza e concisione.
Poi indica quale preferisci complessivamente: "X", "Y" o "tie" (solo se davvero equivalenti).
"""


class Scores(BaseModel):
    helpfulness: int = Field(ge=1, le=5)
    rules: int = Field(ge=1, le=5)
    clarity: int = Field(ge=1, le=5)


class Verdict(BaseModel):
    x: Scores
    y: Scores
    preference: str = Field(description='"X", "Y" or "tie"')
    reason: str = Field(description="one sentence, in Italian")


def _key(sample: dict) -> tuple[str, int, int]:
    return (sample["scenario"], sample.get("run", 0), sample["turn"])


async def _judge(client, model: str, prompt: str, first: str, second: str) -> Verdict:
    content = (
        f"DOMANDA DELL'UTENTE:\n{prompt}\n\n"
        f"RISPOSTA X:\n{first or '(vuota)'}\n\n"
        f"RISPOSTA Y:\n{second or '(vuota)'}"
    )
    response = await client.aio.models.generate_content(
        model=model,
        contents=content,
        config=types.GenerateContentConfig(
            system_instruction=JUDGE_INSTRUCTIONS,
            temperature=0.0,
            response_mime_type="application/json",
            response_schema=Verdict,
        ),
    )
    return Verdict.model_validate_json(response.text or "{}")


async def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("bench_a")
    parser.add_argument("bench_b")
    parser.add_argument("--judge-role", default=ModelRole.QUOTE.value, choices=[r.value for r in ModelRole])
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--out", default=None)
    args = parser.parse_args()

    with open(args.bench_a, encoding="utf-8") as fa, open(args.bench_b, encoding="utf-8") as fb:
        a = {_key(s): s for s in json.load(fa)["samples"]}
        b = {_key(s): s for s in json.load(fb)["samples"]}
    keys = sorted(a.keys() & b.keys())
    model = get_model_id(ModelRole(args.judge_role))
    client = get_genai_client()
    rng = random.Random(args.seed)

    results = []
    for key in keys:
        sa, sb = a[key], b[key]
        swap = rng.random() < 0.5
        first, second = (sb, sa) if swap else (sa, sb)
        verdict = await _judge(client, model, sa["prompt"], first["response"], second["response"])
        score_a, score_b = (verdict.y, verdict.x) if swap else (verdict.x, verdict.y)
        pref = {"tie": "tie", "X": "B" if swap else "A", "Y": "A" if swap else "B"}.get(verdict.preference, "tie")
        results.append({
            "key": list(key), "prompt": sa["prompt"], "preference": pref, "reason": verdict.reason,
            "a": score_a.model_dump(), "b": score_b.model_dump(),
            "a_response": sa["response"], "b_response": sb["response"],
        })
        print(f"{key}: preferred={pref} A={score_a.model_dump()} B={score_b.model_dump()} — {verdict.reason}")

    def mean(side: str, field: str) -> float:
        return round(sum(r[side][field] for r in results) / max(1, len(results)), 2)

    summary = {
        "judge_model": model,
        "pairs": len(results),
        "preference": dict(Counter(r["preference"] for r in results)),
        **{f"{side}.{f}": mean(side, f) for side in ("a", "b") for f in ("helpfulness", "rules", "clarity")},
    }
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"summary": summary, "results": results}, fh, indent=2, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
