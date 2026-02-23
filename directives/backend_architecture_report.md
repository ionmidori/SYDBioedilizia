# Backend Architecture Report: The "Neural Core"

**Status:** Production-Ready (v3.5.13)
**Stack:** Python 3.12, FastAPI, LangGraph, Google Cloud Run
**AI Model:** Gemini 2.5 Flash (via Vertex AI)

---

## 1. High-Level Design (The "3-Tier" Execution)

The backend is not a simple CRUD API. It is a **Stateful Cognitive Engine** designed to orchestrate complex renovation workflows. It strictly adheres to the **Separation of Concerns** principle:

*   **Tier 1 (API Gateway):** FastAPI handles request validation, security, and routing.
*   **Tier 2 (Cognitive Layer):** LangGraph manages the "Thread of Thought," separating reasoning from execution.
*   **Tier 3 (Integration Layer):** Connectors for Firebase (DB/Auth), Storage, and external AI models.

---

## 2. Core Components

### 2.1 API Gateway (`main.py`)
The entry point is a high-performance `uvicorn` server optimized for **Cloud Run** (port 8080).

*   **Lifespan Management:** Async startup/shutdown hooks initialize Firebase and HTTP clients once (Singleton pattern).
*   **Middleware Stack (Execution Order):**
    1.  `request_id_middleware`: Injects a UUID for distributed tracing.
    2.  `metrics_middleware`: Tracks latency and payload size for observability.
    3.  `app_check_middleware`: **Zero-Trust Gate**. Rejects any request without a valid Firebase App Check token (blocks bots/curl).
    4.  `security_headers_middleware`: Enforces strict HSTS, XSS protection, and CSP.
    5.  `CORSMiddleware`: Whitelists only the Vercel frontend domain.

### 2.2 The "Brain" (LangGraph Orchestration)
Located in `src/graph/`, this is the heart of the system. It replaces the traditional "Chain" with a **Cyclic State Graph**.

*   **State Schema (`state.py`):**
    *   `messages`: Standard LangChain message history.
    *   `internal_plan`: A windowed list (max 5) of the agent's reasoning steps.
    *   `project_context`: Real-time snapshot of the renovation project (Budget, Location, Style).
*   **The 3-Node Architecture (`factory.py`):**
    1.  **Reasoning Node:** The "Architect". It analyzes the user's input and the current state to produce a *structured plan* (JSON). It does *not* execute tools.
    2.  **Execution Node:** The "Builder". It receives the plan and executes the necessary tools (e.g., `generate_render`, `calculate_quote`).
    3.  **Tools Node:** The "System". Updates the global state based on tool outputs (e.g., "Render Generated", "Quote Drafted").

### 2.3 Context Builder (`context_builder.py`)
Dynamic Prompt Engineering. Before every AI turn, it re-assembles the System Prompt by fetching:
*   **Hard Data:** Budget constraints, SQM, Location from Firestore.
*   **Soft Data:** User style preferences (e.g., "Japandi", "Luxury").
*   **Visual Context:** List of recently uploaded images/videos.

---

## 3. Data & Persistence ("Golden Sync")

*   **Database:** Firestore (NoSQL).
    *   **Collections:** `users`, `projects`, `chat_history`.
    *   **Pattern:** Repository Pattern (`src/repositories/`) ensures code decoupling.
*   **Consistency:** The Backend is the **Source of Truth**. Pydantic models in `src/core/schemas.py` strictly define the data structure, which is mirrored in the Frontend's TypeScript interfaces.

---

## 4. Security Implementation

*   **Authentication:**
    *   **JWT:** Validates Firebase ID Tokens on every protected route.
    *   **App Check:** Validates the *client integrity* (ReCAPTCHA v3 Enterprise).
*   **Input Sanitization:** All inputs are validated via Pydantic V2 schemas.
*   **Secret Management:** Environment variables (Google Secret Manager in Prod).

---

## 5. External Integrations

*   **Vertex AI (Gemini 2.5):** The main reasoning brain. Used for chat, vision analysis, and plan generation.
*   **Imagen 3:** Generates photo-realistic renovation renders.
*   **Perplexity Sonar:** Provides real-time market intelligence (material prices, local regulations).
*   **Firebase Storage:** Stores user uploads and generated PDFs/Images.

---

## 6. Deployment & Operations

*   **Container:** Docker (Multi-stage build).
*   **Runtime:** Google Cloud Run (Serverless, Auto-scaling).
*   **CI/CD:** GitHub Actions triggers builds on push to `main`.
*   **Observability:** Structured JSON logs (Google Cloud Logging compatible).
