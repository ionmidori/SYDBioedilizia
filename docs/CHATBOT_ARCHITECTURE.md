# Chatbot Architecture: The "Reasoning Engine"

**Status:** Production-Ready (v3.5.13)
**Core Tech:** Vercel AI SDK (Frontend), LangGraph (Backend Logic), Server-Sent Events (Transport)

---

## 1. High-Level Concept
This is not a standard "RAG Chatbot". It is an **Agentic Reasoning Engine**.
Instead of simply retrieving documents, it:
1.  **Plans** a multi-step approach (Reasoning Node).
2.  **Executes** tools (Search, Vision, Quote Calculation).
3.  **Reflects** on the output.
4.  **Streams** its "thought process" to the user in real-time (Glass Box AI).

---

## 2. The Data Flow Pipeline

### Step 1: Frontend Capture (`web_client/components/chat/`)
*   **Component:** `ChatProvider.tsx` wraps the app.
*   **Hook:** `useChat` (Vercel AI SDK) manages the message list, input state, and streaming connection.
*   **Context:** It attaches `projectId` (if on a dashboard page) and `idToken` (Firebase Auth) to every request header.

### Step 2: The Node.js Proxy (`web_client/app/api/chat/route.ts`)
*   **Role:** Security & Protocol Adaptation.
*   **Action:**
    *   Validates the session.
    *   Forwards the request to the Python Backend (`http://backend:8080/chat/stream`).
    *   **Crucial:** It keeps the connection open for Server-Sent Events (SSE).

### Step 3: Backend Orchestration (`backend_python/src/services/agent_orchestrator.py`)
*   **Entry:** `stream_chat` endpoint receives the message.
*   **Setup:**
    *   Validates JWT & App Check.
    *   Loads conversation history from Firestore (`ConversationRepository`).
    *   Builds the dynamic System Prompt (`ContextBuilder`) with project data.
*   **Execution:** Invokes the **LangGraph** agent.

### Step 4: The "Thought Stream" (`status_handler.py`)
*   **Mechanism:** We listen to LangGraph events (`on_chain_start`, `on_tool_start`, `on_chat_model_stream`).
*   **Protocol (Vercel AI Data Stream v1):**
    *   **Event `0` (Text):** The final answer chunks.
    *   **Event `2` (Data):** JSON objects containing:
        *   `type: "status"` -> Updates the UI pill ("Analizzando i documenti...").
        *   `type: "reasoning_step"` -> Adds a card to the "Reasoning Log" (e.g., "Identified 3 potential issues in the plan").
    *   **Event `9` (Tool Call):** Signals a tool is being executed.

### Step 5: Persistence ("Golden Record")
*   **Firestore:** Every message (User & Assistant) is saved to `chat_history/{sessionId}`.
*   **Optimization:** We store the *final* answer, not the intermediate reasoning steps, to keep history clean and cost-effective.

---

## 3. Frontend UI Components

### `ChatInterface.tsx`
The main container. Handles the "Scroll to Bottom" logic and displays the message list.

### `ThinkingIndicator.tsx`
A pulsating UI element that appears while the agent is "thinking". It subscribes to the `status` data stream to show real-time updates (e.g., "Searching market prices...").

### `ReasoningStepView.tsx`
A collapsible accordion that reveals the agent's internal logic.
*   **Why?** Builds trust. The user sees *why* a price was quoted or a material suggested.
*   **Data:** Populated by `reasoning_step` events from the backend.

### `ChatInput.tsx`
Multi-modal input.
*   **Text:** Auto-expanding textarea.
*   **Images:** Drag & Drop support. Uploads to Firebase Storage *before* sending the message, passing the URL to the agent.

---

## 4. Backend Graph Structure (`backend_python/src/graph/`)

The brain is a **StateGraph** with 3 primary nodes:

1.  **Reasoning Node (Gemini 2.5 Flash):**
    *   **Input:** User message + Context.
    *   **Output:** A structured `Plan` (JSON). It *decides* what to do, but doesn't do it.
    *   **Constraint:** Forced to output valid JSON via Pydantic.

2.  **Execution Node:**
    *   **Input:** The `Plan`.
    *   **Action:** Executes the requested tools (e.g., `market_prices`, `generate_render`).
    *   **Safety:** Catches tool errors and feeds them back to the reasoning node for correction.

3.  **Response Node:**
    *   **Action:** Synthesizes the tool outputs into a natural language response for the user.

---

## 5. Security & Constraints

*   **Auth:** Zero-Trust. No chat without a valid Firebase ID Token.
*   **Rate Limiting:** Regulated by Firestore Quotas (Tier 1: 50 msg/day).
*   **Sanitization:** All tool outputs are treated as untrusted strings until validated.
