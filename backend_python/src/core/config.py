from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Centralized configuration for the application.
    Enforces strict typing and validation of environment variables.
    """
    ENV: str = Field(default="production", description="Environment: development, production. Defaults to production (fail-secure).")
    # 🔐 Auth bypass is DEV-ONLY and must be opted into EXPLICITLY (defence-in-depth).
    # A single ENV misconfiguration must NOT be enough to disable token verification:
    # the bypass requires BOTH ENV=development AND ALLOW_AUTH_BYPASS=True, and the
    # validator below hard-refuses startup if it is ever enabled outside development.
    ALLOW_AUTH_BYPASS: bool = Field(
        default=False,
        description="DEV ONLY. Skips Firebase token verification. Forbidden when ENV != development.",
    )
    # GOOGLE_CLOUD_PROJECT is the canonical GCP env var name.
    # PROJECT_ID is kept for backward compatibility with legacy code.
    GOOGLE_CLOUD_PROJECT: str = Field(
        default="",
        validation_alias=AliasChoices("GOOGLE_CLOUD_PROJECT", "PROJECT_ID", "GCP_PROJECT", "FIREBASE_PROJECT_ID"),
        description="GCP Project ID used by FirestoreSaver, Firestore, and Firebase Admin SDK.",
    )
    PROJECT_ID: str = Field(
        default="",
        description="Legacy alias — prefer GOOGLE_CLOUD_PROJECT for new code.",
    )

    # Secrets
    # We allow None during init if .env is missing, but logic should check them.
    # Ideally, we enforce them.
    GEMINI_API_KEY: str | None = Field(default=None, description="Required for Gemini AI models")
    GOOGLE_API_KEY: str | None = Field(default=None, description="Legacy alias for GEMINI_API_KEY")
    PERPLEXITY_API_KEY: str | None = Field(default=None, description="Required for Market Prices")
    PINECONE_API_KEY: str | None = Field(default=None, description="Required for RAG Vector Database")

    # ── RAG retrieval tuning ──────────────────────────────────────────────────
    RAG_RERANK_ENABLED: bool = Field(
        default=False,
        description="Re-rank Pinecone candidates with a cross-encoder before returning. "
                    "Over-fetches RAG_RERANK_OVERFETCH×top_k, then keeps top_k by rerank score. "
                    "Default OFF: a retrieval eval (bge-reranker-v2-m3, 2026-06-28) showed no "
                    "unit-match@1 gain and a small @3 regression on the prezzario corpus. "
                    "Re-evaluate with Ragas / chunk-ID labels before enabling.",
    )
    RAG_RERANK_MODEL: str = Field(
        default="bge-reranker-v2-m3",
        description="Pinecone hosted reranker. bge-reranker-v2-m3 is multilingual (good for IT).",
    )
    RAG_RERANK_OVERFETCH: int = Field(
        default=4,
        description="Candidate multiplier for reranking: fetch top_k×this, rerank down to top_k.",
    )
    RAG_MIN_SCORE: float = Field(
        default=0.0,
        description="Drop results whose relevance score is below this threshold. "
                    "0.0 disables filtering. Tune against eval_rag.py (rerank scores run higher).",
    )

    # ── Gemini model registry ────────────────────────────────────────────────
    # The ONLY place where Gemini model IDs live (see src/core/models.py). Every
    # agent, vision helper, tool and script resolves its model by ROLE from these
    # settings, so switching models is an env change (Cloud Run / .env), not a
    # code change. Pin GA model IDs; never floating aliases (`*-latest`).
    # A guard test fails if a "gemini-" literal appears anywhere else in src/.
    # Defaults (2026-10-10, product decision): 3.5 Flash-Lite for every chat role
    # (quotes included); 3.8 Flash ONLY to analyze the customer's uploaded photos
    # and videos (MODEL_VISION: vision helpers + any agent turn carrying media,
    # see src/adk/media_model_plugin.py). Validated with scripts/chat_latency_bench.py
    # + scripts/chat_quality_ab.py (blind LLM judge, 27 pairs): all-3.5-Flash-Lite
    # matched 3.8-Flash-for-quotes on quality (8-9, 10 ties) with a much shorter
    # latency tail, and both beat the retired gemini-3.1-flash-lite-preview.
    CHAT_MODEL_VERSION: str = Field(
        default="gemini-3.5-flash-lite",
        description="Fallback model for every text role whose MODEL_<ROLE> is unset.",
    )
    MODEL_ROUTER: str | None = Field(default=None, description="syd_orchestrator (router). Falls back to CHAT_MODEL_VERSION.")
    MODEL_TRIAGE: str | None = Field(default=None, description="triage sub-agent. Falls back to CHAT_MODEL_VERSION.")
    MODEL_DESIGN: str | None = Field(default=None, description="design sub-agent. Falls back to CHAT_MODEL_VERSION.")
    MODEL_QUOTE: str | None = Field(default=None, description="quote sub-agent. Falls back to CHAT_MODEL_VERSION.")
    MODEL_VISION: str | None = Field(
        default="gemini-3.8-flash",
        description="Analysis of the customer's uploaded photos/videos: vision helpers (triage, video, "
                    "measurements, CAD, render prompt) and every agent model call whose current user "
                    "message carries an image or video.",
    )
    MODEL_INSIGHT: str | None = Field(default=None, description="Quote InsightEngine. Falls back to CHAT_MODEL_VERSION.")
    MODEL_IMAGE: str = Field(
        default="gemini-3.1-flash-image-preview",
        description="Image generation / editing (renders).",
    )
    # Per-role thinking level: minimal | low | medium | high. Unset = model default.
    THINKING_LEVEL_ROUTER: str | None = Field(default="minimal")
    THINKING_LEVEL_TRIAGE: str | None = Field(default="minimal")
    THINKING_LEVEL_DESIGN: str | None = Field(default="minimal")
    THINKING_LEVEL_QUOTE: str | None = Field(default="low")
    THINKING_LEVEL_VISION: str | None = Field(default="low")  # 3.8 Flash has no "minimal"
    THINKING_LEVEL_INSIGHT: str | None = Field(default=None)
    # Per-call limits for the chat agents. Unset = SDK defaults (no timeout, no retry).
    LLM_TIMEOUT_SECONDS: float | None = Field(
        default=30.0,
        description="Per model-call HTTP timeout for chat agents. Production calls of the retired "
                    "preview model reached 35-45s; a bounded call + retry beats an unbounded tail.",
    )
    LLM_RETRY_ATTEMPTS: int | None = Field(
        default=2, description="Total attempts per model call (1 = no retry) for chat agents."
    )
    LLM_MAX_OUTPUT_TOKENS: int | None = Field(
        default=None, description="Max output tokens for chat agents."
    )
    # Gemini backend: AI Studio (API key) by default, Vertex AI when true. The
    # google-genai client (and ADK) read the same env vars directly.
    GOOGLE_GENAI_USE_VERTEXAI: bool = Field(default=False)
    GOOGLE_CLOUD_LOCATION: str = Field(
        default="eu",
        description="Vertex AI location for Gemini. `eu` = EU multi-region endpoint (data processed in "
                    "the EU); europe-west1 does not serve the Gemini 3.x models (verified 2026-10-09).",
    )
    MODEL_VALIDATION_STRICT: bool = Field(
        default=False,
        description="Fail startup when a configured model ID is unknown to the API (staging).",
    )

    # Feature Flags (App Check enabled by default for production safety)
    ENABLE_APP_CHECK: bool = Field(default=True, description="Enable Firebase App Check (set to false for local dev)")
    # Orchestration backend (ADK-only since Phase 4 — LangGraph decommissioned)
    ORCHESTRATOR_MODE: str = Field(
        default="vertex_adk",
        description="Orchestration backend: 'vertex_adk'",
    )
    ADK_CANARY_PERCENT: int = Field(
        default=0,
        description="Percentage of new sessions (0-100) routed to ADK when ORCHESTRATOR_MODE=canary."
    )
    # P1 Requirement: EU Region constraint for ADK
    ADK_LOCATION: str = Field(
        default="europe-west1",
        description="GCP Region for Vertex AI ADK to enforce GDPR Data Residency"
    )
    # P1 Requirement: CMEK Encryption
    ADK_CMEK_KEY_NAME: str | None = Field(
        default=None,
        description="Cloud KMS Key Name for CMEK encryption of ADK Sessions"
    )
    USE_CHECKPOINTER: bool = Field(
        default=False,
        description="Enable FirestoreSaver checkpointing on the main conversation graph. "
                    "Quote graph always uses checkpointing regardless of this flag.",
    )

    # Auth & Infrastructure
    RP_ID: str | None = Field(default=None, description="WebAuthn Relying Party ID")
    FIREBASE_CREDENTIALS: str | None = Field(default=None, description="Path to firebase credentials json")

    # Firebase Environment Variables (Alternative to JSON file)
    FIREBASE_PROJECT_ID: str | None = None
    FIREBASE_PRIVATE_KEY_ID: str | None = None
    FIREBASE_PRIVATE_KEY: str | None = None
    FIREBASE_CLIENT_EMAIL: str | None = None
    FIREBASE_CLIENT_ID: str | None = None
    FIREBASE_STORAGE_BUCKET: str | None = None

    # n8n MCP Integration (Webhook URLs)
    N8N_WEBHOOK_NOTIFY_ADMIN: str | None = Field(default=None, description="n8n webhook URL to notify admin of new quote draft")
    N8N_WEBHOOK_DELIVER_QUOTE: str | None = Field(default=None, description="n8n webhook URL to deliver approved quote to client")
    N8N_API_KEY: str | None = Field(default=None, description="Optional API key for n8n webhook authentication")
    # Shared HMAC-SHA256 secret for webhook request signing (prevents replay attacks).
    # Generate with: python -c "import secrets; print(secrets.token_hex(32))"
    N8N_WEBHOOK_HMAC_SECRET: str | None = Field(default=None, description="Shared HMAC-SHA256 secret for n8n webhook signature verification")
    # Comma-separated allowlist of valid n8n hostnames (SSRF prevention).
    # Example: "n8n.sydbioedilizia.com,n8n-staging.sydbioedilizia.com"
    N8N_ALLOWED_WEBHOOK_HOSTS: str | None = Field(default=None, description="Comma-separated allowlist of n8n webhook hostnames (SSRF guard)")
    ADMIN_DASHBOARD_URL: str = Field(default="http://localhost:8501", description="Base URL of the Streamlit admin console")

    # Account Lifecycle (GDPR B2C Inactivity Policy)
    LIFECYCLE_SECRET: str | None = Field(
        default=None,
        description="Shared secret for POST /internal/lifecycle/run (X-Lifecycle-Secret header). Set in Cloud Scheduler job.",
    )
    LIFECYCLE_WARN_MONTHS: int = Field(default=12, description="Months of inactivity before warning email is sent.")
    LIFECYCLE_DISABLE_MONTHS: int = Field(default=13, description="Months of inactivity before Firebase Auth is disabled.")
    LIFECYCLE_ANONYMIZE_MONTHS: int = Field(default=24, description="Months of inactivity before Firestore PII is anonymized.")

    # Admin Console internal trust (server-to-server, no Firebase user on the Streamlit side)
    ADMIN_INTERNAL_SECRET: str | None = Field(
        default=None,
        description="Shared secret for POST /internal/quote/approve (X-Admin-Internal-Secret "
                    "header). Dedicated secret, distinct from LIFECYCLE_SECRET, so a leak of "
                    "one does not grant access to the other's action.",
    )

    # Model Armor (Runtime Guardrails — OWASP LLM01/LLM02)
    MODEL_ARMOR_ENABLED: bool = Field(
        default=True,
        description="Enable Model Armor API guardrails (OWASP LLM01/LLM02). "
                    "Secure-by-default: inert until MODEL_ARMOR_TEMPLATE_ID is also set "
                    "(get_model_armor_service() returns None and guardrails no-op), so "
                    "enabling this has no effect until a template is configured in GCP.",
    )
    MODEL_ARMOR_TEMPLATE_ID: str = Field(
        default="",
        description="Model Armor template ID from GCP console (defines active filters).",
    )
    MODEL_ARMOR_LOCATION: str = Field(
        default="us-central1",
        description="Regional endpoint for Model Armor API.",
    )
    OUTPUT_GUARDRAIL_STREAMING: bool = Field(
        default=True,
        description="True (stream-then-verify): reply text is streamed as it is generated and "
                    "the output guardrails (leak filter on the accumulated text, Model Armor on "
                    "the final response) retract it with a `data-redact` part if they block it — "
                    "blocked text can be visible for the time it takes to finish the reply. "
                    "False (verify-then-stream): text is held until Model Armor approved the final "
                    "response, then sent at once — nothing unscanned is ever shown, but the user "
                    "waits for the whole reply (no token streaming of text).",
    )
    MODEL_ARMOR_FAIL_CLOSED: bool = Field(
        default=False,
        description="F-02: when True, a Model Armor API error/timeout BLOCKS the "
                    "prompt/response (fail-closed) instead of passing it through "
                    "(fail-open). Note: this only affects requests where Model Armor "
                    "is active — it has no effect if MODEL_ARMOR_TEMPLATE_ID is unset.",
    )

    # Native Notification Service (SMTP — active replacement for n8n when n8n is unavailable)
    SMTP_HOST: str | None = Field(default=None, description="SMTP server hostname (e.g. smtp.gmail.com)")
    SMTP_PORT: int = Field(default=587, description="SMTP server port (587 for STARTTLS, 465 for SSL)")
    SMTP_USER: str | None = Field(default=None, description="SMTP username/email for authentication")
    SMTP_PASSWORD: str | None = Field(default=None, description="SMTP password or app-specific password")
    SMTP_FROM_EMAIL: str = Field(default="noreply@sydbioedilizia.com", description="Sender email address for notifications")
    SMTP_FROM_NAME: str = Field(default="SYD Bioedilizia", description="Sender display name for notifications (e.g. 'SYD Bioedilizia <noreply@...>')")
    ADMIN_EMAIL: str | None = Field(default=None, description="Admin email address for quote review notifications")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Allow extra keys in .env
        populate_by_name=True,  # Allow field name OR alias for setting values
    )

    @model_validator(mode="after")
    def _sync_project_id(self) -> "Settings":
        """Keep PROJECT_ID in sync with GOOGLE_CLOUD_PROJECT for legacy code."""
        if not self.PROJECT_ID:
            self.PROJECT_ID = self.GOOGLE_CLOUD_PROJECT
        return self

    @model_validator(mode="after")
    def _forbid_auth_bypass_in_prod(self) -> "Settings":
        """Fail-secure: refuse to start if the auth bypass is enabled outside development.

        This guarantees a single env-var slip (e.g. ALLOW_AUTH_BYPASS leaking into a
        production deployment) can never silently disable Firebase token verification.
        """
        if self.ENV != "development" and self.ALLOW_AUTH_BYPASS:
            raise ValueError(
                "ALLOW_AUTH_BYPASS must not be True when ENV != 'development' "
                f"(ENV={self.ENV!r}). Refusing to start with auth verification disabled."
            )
        return self

    @model_validator(mode="after")
    def _warn_weak_secrets_in_prod(self) -> "Settings":
        """F-07: warn (non-blocking) if production security secrets look weak.

        Non-fatal on purpose — optional integrations (n8n, lifecycle scheduler)
        may legitimately be unconfigured. Rotate any set secret to >=32 random
        chars and prefer a secret manager over committed/.env values in prod.
        """
        if self.ENV == "production":
            import logging
            _log = logging.getLogger(__name__)
            for name in ("N8N_WEBHOOK_HMAC_SECRET", "LIFECYCLE_SECRET", "ADMIN_INTERNAL_SECRET"):
                value = getattr(self, name, None)
                if value and len(value) < 32:
                    _log.warning(
                        "[config] %s is set but short (<32 chars) in production — "
                        "rotate to a high-entropy secret (>=32 chars).",
                        name,
                    )
        return self

    @property
    def api_key(self) -> str:
        """Unified accessor for Gemini API Key."""
        key = self.GEMINI_API_KEY or self.GOOGLE_API_KEY
        if not key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY is missing in environment variables.")
        return key

# Singleton instance
settings = Settings()
