"""
Chat latency benchmark for /chat/stream (AI SDK v6 UI message stream).

Measures, per request, as seen by the client:
    ttfb   first SSE line (the "Syd sta analizzando..." status chunk)
    ttft   first text-delta with real content (what the user perceives)
    total  [DONE] received

Usage (from backend_python/):
    # Local backend with the DEV auth bypass (ENV != production):
    uv run python scripts/chat_latency_bench.py --url http://127.0.0.1:8080 --runs 5

    # Any environment with a real Firebase ID token:
    uv run python scripts/chat_latency_bench.py --url https://<host> --token "$ID_TOKEN"

    # Save a baseline to compare later phases against:
    uv run python scripts/chat_latency_bench.py --runs 10 --out bench_baseline.json

Each run uses a fresh session id, so every run starts a new conversation (the
first turn of a conversation is the latency users complain about). Add
`--turns 3` to also measure follow-up turns in the same session.

Server-side breakdown for each turn is logged by the backend as
`chat_turn_timing` (see src/core/chat_timing.py).
"""
from __future__ import annotations

import argparse
import base64
import json
import statistics
import sys
import time
import uuid
from dataclasses import asdict, dataclass

import httpx

SCENARIOS: dict[str, list[str]] = {
    "greeting": ["Ciao, chi sei?", "Cosa puoi fare per me?", "Grazie!"],
    "price": [
        "Quanto costa al metro quadro rifare un pavimento in gres?",
        "E per un parquet?",
        "Grazie",
    ],
    "renovation": [
        "Vorrei ristrutturare il bagno, da dove partiamo?",
        "È un bagno di circa 6 metri quadri",
        "Che tempi servono?",
    ],
}


def _dev_token() -> str:
    """Unsigned token accepted only by the DEV auth bypass (ENV != production)."""
    claims = {"user_id": "latency-bench", "firebase": {"sign_in_provider": "password"}}
    payload = base64.urlsafe_b64encode(json.dumps(claims).encode()).decode().rstrip("=")
    return f"dev.{payload}.sig"


@dataclass
class Sample:
    scenario: str
    run: int
    turn: int
    status: int
    ttfb_ms: float | None
    ttft_ms: float | None
    total_ms: float | None
    text_chars: int
    error: str | None = None
    prompt: str = ""
    response: str = ""


def _run_turn(client: httpx.Client, url: str, token: str, session_id: str, text: str,
              scenario: str, run: int, turn: int, timeout: float) -> Sample:
    payload = {
        "messages": [{"id": uuid.uuid4().hex, "role": "user", "content": text}],
        "sessionId": session_id,
    }
    headers = {"Authorization": f"Bearer {token}", "Accept": "text/event-stream"}
    start = time.perf_counter()
    ttfb = ttft = total = None
    chars = 0
    parts: list[str] = []

    def ms() -> float:
        return round((time.perf_counter() - start) * 1000, 1)

    try:
        with client.stream("POST", f"{url.rstrip('/')}/chat/stream", json=payload,
                           headers=headers, timeout=timeout) as resp:
            if resp.status_code != 200:
                resp.read()
                return Sample(scenario, run, turn, resp.status_code, None, None, ms(), 0,
                              error=resp.text[:200])
            for line in resp.iter_lines():
                if not line:
                    continue
                if ttfb is None:
                    ttfb = ms()
                if not line.startswith("data: "):
                    continue
                body = line[len("data: "):]
                if body == "[DONE]":
                    total = ms()
                    break
                chunk = json.loads(body)
                if chunk.get("type") == "text-delta":
                    delta = str(chunk.get("delta", ""))
                    chars += len(delta)
                    parts.append(delta)
                    if ttft is None and delta.strip().strip(".").strip():
                        ttft = ms()
            return Sample(scenario, run, turn, 200, ttfb, ttft, total or ms(), chars,
                          prompt=text, response="".join(parts))
    except httpx.HTTPError as exc:
        return Sample(scenario, run, turn, 0, ttfb, ttft, ms(), chars, error=repr(exc))


def _pct(values: list[float], p: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(p * len(ordered)))]


def _summary(samples: list[Sample]) -> dict[str, dict[str, float | int | None]]:
    out: dict[str, dict[str, float | int | None]] = {}
    groups: dict[str, list[Sample]] = {}
    for s in samples:
        key = "first_turn" if s.turn == 0 else "follow_up"
        groups.setdefault(key, []).append(s)
    for key, group in groups.items():
        ok = [s for s in group if s.status == 200 and s.error is None]
        for metric in ("ttfb_ms", "ttft_ms", "total_ms"):
            vals = [v for s in ok if (v := getattr(s, metric)) is not None]
            out[f"{key}.{metric}"] = {
                "n": len(vals),
                "p50": _pct(vals, 0.5),
                "p90": _pct(vals, 0.9),
                "p95": _pct(vals, 0.95),
                "mean": round(statistics.fmean(vals), 1) if vals else None,
            }
        out[f"{key}.errors"] = {"n": len(group) - len(ok)}
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--url", default="http://127.0.0.1:8080")
    parser.add_argument("--token", default=None, help="Firebase ID token (omit for the local DEV bypass)")
    parser.add_argument("--runs", type=int, default=3, help="conversations per scenario")
    parser.add_argument("--turns", type=int, default=1, help="turns per conversation (max 3)")
    parser.add_argument("--scenario", choices=sorted(SCENARIOS), action="append")
    parser.add_argument("--timeout", type=float, default=200.0)
    parser.add_argument("--out", default=None, help="write samples + summary as JSON")
    args = parser.parse_args()

    token = args.token or _dev_token()
    scenarios = args.scenario or sorted(SCENARIOS)
    samples: list[Sample] = []
    with httpx.Client(http2=False) as client:
        for scenario in scenarios:
            for run in range(args.runs):
                session_id = f"bench-{uuid.uuid4().hex[:16]}"
                for turn, text in enumerate(SCENARIOS[scenario][: max(1, min(args.turns, 3))]):
                    s = _run_turn(client, args.url, token, session_id, text, scenario, run, turn, args.timeout)
                    samples.append(s)
                    print(f"{scenario:<11} run={run} turn={turn} status={s.status} "
                          f"ttfb={s.ttfb_ms} ttft={s.ttft_ms} total={s.total_ms} chars={s.text_chars}"
                          + (f" error={s.error}" if s.error else ""), flush=True)

    summary = _summary(samples)
    print(json.dumps(summary, indent=2))
    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            json.dump({"url": args.url, "samples": [asdict(s) for s in samples], "summary": summary},
                      fh, indent=2)
    return 0 if all(s.error is None for s in samples) else 1


if __name__ == "__main__":
    sys.exit(main())
