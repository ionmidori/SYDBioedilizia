# Feasibility Study & Architecture Plan: SYD Next-Gen Visual Intelligence

## Executive Summary: Go/No-Go Assessment
- **Native Video Understanding**: **GO**. Gemini 1.5 Pro is effectively the industry leader for native video context.
- **Speculative Execution**: **GO (Experimental)**. Highly effective for low-latency feel, requires careful management of parallel tool calls to avoid quota exhaustion.

---

## 1. Native Video Understanding (Gemini 1.5 Pro)

### Technical Analysis
- **The Goal**: Move from frame-slicing (current triage) to true temporal understanding.
- **File API vs. Base64**:
    - **Recommendation**: **Google AI File API**. 
    - **Why**: Base64 has a 33% overhead and is often limited to 20MB. File API allows files up to 2GB, supports resumable uploads, and caches the file on Google infrastructure.
- **Latency & UX**:
    - **Processing Time**: Expect 10-15 seconds for a 30s video.
    - **UX Strategy**: Implement an "Uploading..." progress bar followed by a "Scanning Room (AI Analysis)..." skeleton state.
- **Token Cost (Estimate)**:
    - 30s video @ default 1fps = ~7,740 tokens (frames) + ~960 tokens (audio) = **~8,700 tokens**.
    - Cost is negligible within a 1M token window (approx $0.03 - $0.07 per scan depending on model).

### Implementation Strategy
1.  **Backend**: Replace the `media_urls` logic in `main.py` with a dedicated `/upload` endpoint that uses the `google-generativeai` File API.
2.  **Prompting**: Update `system_instruction` to explicitly ask for "Temporal Analysis" (e.g., "Analyze the movement between frames to determine the exact length of the walls").

---

## 2. Speculative Execution (Predictive UX)

### The Mechanism: "Pre-fetching Logic"
1.  **Frontend Trigger**: Listen to `onInput` in the chat window. 
2.  **Heuristic Analysis**: If the user types a "high-intent" keyword (e.g., "prezzi", "marmo", "parquet"), the frontend sends a *partial* request to a `/speculative/tools` endpoint.
3.  **Background Cache**: The backend executes the relevant tool (e.g., `get_market_prices`) and stores the result in a server-side cache (Redis/InMemory).
4.  **Final Execution**: When the user hits "Send", the AI agent checks the cache. Result is injected instantly.

### Risks & Mitigations
- **Quota Waste**: User might delete their draft. 
    - *Mitigation*: Only trigger speculation after a 500ms debounce and 3+ words.
- **Cold Starts**: Speculative calls must be ultra-fast (async).

---

## Roadmap

| Phase | Task | ETA |
| :--- | :--- | :--- |
| **Phase 1** | Migrate to Google AI File API for Video | 2 Days |
| **Phase 2** | Implement `/speculative/tools` middleware | 3 Days |
| **Phase 3** | Frontend "Predictive" UI feedback | 1 Day |

---
**Architectural Goal**: Achieving < 500ms perceived latency for technical queries.
