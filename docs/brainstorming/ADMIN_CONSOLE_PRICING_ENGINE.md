# Admin Console & Pricing Engine Architecture

**Status:** Production-Ready (v3.5.13)
**Tech Stack:** Streamlit (Admin), FastAPI (Backend), Firestore (Data), Perplexity Sonar (Market Intel)

---

## 1. Overview
The **Admin Console** is the "Mission Control" for SYD Bioedilizia. It allows human experts to oversee, correct, and approve the output of the AI agents.
The **Pricing Engine** is a hybrid system combining deterministic pricing (Master Price Book) with probabilistic AI reasoning (LangGraph + Insight Engine) and real-time market data (Perplexity).

---

## 2. The "3-Tier" Pricing Logic

### Tier 1: The Source of Truth (Master Price Book)
*   **Format:** JSON (`backend_python/src/data/master_price_book.json`).
*   **Management:** Edited via **Streamlit** (`admin_tool/pages/2_💰_Price_Book.py`).
*   **Structure:**
    ```json
    [
      {
        "sku": "DEM-001",
        "category": "Demolizioni",
        "description": "Demolizione tramezzi in forati (sp. <10cm)",
        "unit": "mq",
        "unit_price": 25.00
      }
    ]
    ```
*   **Constraint:** The AI *cannot* invent prices. It must map user intent to existing SKUs.

### Tier 2: AI Reasoning (Insight Engine)
*   **Location:** `backend_python/src/services/insight_engine.py` & `quote_tools.py`.
*   **Process:**
    1.  **Ingest:** Chat history + Uploaded Images (Project context).
    2.  **Analyze:** Gemini 1.5 Pro analyzes the visual/textual data to identify works (e.g., "I see a 20sqm parquet floor needing removal").
    3.  **Map:** It suggests a list of SKUs (`DEM-FLOOR-REM` x 20).
    4.  **Validate:** The system filters out any hallucinated SKU not present in Tier 1.

### Tier 3: Market Intelligence (Perplexity Sonar)
*   **Tool:** `backend_python/src/tools/market_prices.py`.
*   **Role:** Handles "off-book" requests or high-volatility materials (e.g., "Current price of Carrara Marble").
*   **Integration:** Queries Perplexity API for real-time local pricing (Rome area) to provide a benchmark, but *does not* auto-update the Price Book (Safety First).

---

## 3. Admin Console Features (`admin_tool/`)

### 📋 Quote Review (`1_📋_Quotes.py`)
*   **HITL (Human-in-the-Loop):**
    *   View all AI-generated drafts (status: `DRAFT`, `PENDING_REVIEW`).
    *   **Edit:** Modify quantities, add/remove SKUs, apply manual discounts.
    *   **Approve:** Triggers PDF generation and email delivery to the client.
*   **Tech:** Connects directly to Firestore (`projects/{id}/private_data/quote`).

### 💰 Price Book Manager (`2_💰_Price_Book.py`)
*   **Data Editor:** Interactive table to bulk-edit prices and descriptions.
*   **Validation:** Prevents saving invalid JSON or duplicate SKUs.
*   **Sync:** Updates the shared JSON file immediately (hot-reload for backend).

---

## 4. Data Flow (The "Golden Sync")

1.  **User** chats/uploads plans on Next.js Frontend.
2.  **LangGraph Agent** calls `suggest_quote_items`.
3.  **Insight Engine** reads `master_price_book.json` and returns valid SKUs.
4.  **Draft Quote** is saved to Firestore.
5.  **Admin** receives notification (optional) and opens Streamlit.
6.  **Admin** reviews/edits the draft in `1_📋_Quotes.py`.
7.  **Final PDF** is generated via `WeasyPrint` and sent to user.

---

## 5. Security & Access
*   **Auth:** Streamlit Authenticator (YAML-based config in `admin_tool/config.yaml`).
*   **RBAC:** Only `admin` role can edit the Price Book. `estimator` role can only review quotes.
*   **Logs:** All price changes are logged to `admin_tool/audit.log`.

---

## 6. Future Roadmap
*   **Dynamic Margin:** Auto-adjust `unit_price` based on Perplexity's raw material cost index.
*   **Visual Proof:** Link specific SKUs in the quote to bounding boxes in the user's uploaded image (Visual Grounding).
