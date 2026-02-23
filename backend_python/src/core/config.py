from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, model_validator

class Settings(BaseSettings):
    """
    Centralized configuration for the application.
    Enforces strict typing and validation of environment variables.
    """
    ENV: str = Field(default="development", description="Environment: development, production")
    # GOOGLE_CLOUD_PROJECT is the canonical GCP env var name.
    # PROJECT_ID is kept for backward compatibility with legacy code.
    GOOGLE_CLOUD_PROJECT: str = Field(
        description="GCP Project ID used by FirestoreSaver, Firestore, and Firebase Admin SDK.",
    )
    PROJECT_ID: str = Field(
        default="",
        description="Legacy alias — prefer GOOGLE_CLOUD_PROJECT for new code.",
    )
    
    # Secrets
    # We allow None during init if .env is missing, but logic should check them.
    # Ideally, we enforce them.
    GEMINI_API_KEY: str | None = Field(None, description="Required for Gemini AI models")
    GOOGLE_API_KEY: str | None = Field(None, description="Legacy alias for GEMINI_API_KEY")
    PERPLEXITY_API_KEY: str | None = Field(None, description="Required for Market Prices")
    CHAT_MODEL_VERSION: str = Field(default="gemini-2.5-flash-lite", description="Default model for chat and analysis")
    
    # Feature Flags (App Check enabled by default for production safety)
    ENABLE_APP_CHECK: bool = Field(default=True, description="Enable Firebase App Check (set to false for local dev)")
    USE_CHECKPOINTER: bool = Field(
        default=False,
        description="Enable FirestoreSaver checkpointing on the main conversation graph. "
                    "Quote graph always uses checkpointing regardless of this flag.",
    )
    
    # Auth & Infrastructure
    RP_ID: str | None = Field(None, description="WebAuthn Relying Party ID")
    FIREBASE_CREDENTIALS: str | None = Field(None, description="Path to firebase credentials json")
    
    # Firebase Environment Variables (Alternative to JSON file)
    FIREBASE_PROJECT_ID: str | None = None
    FIREBASE_PRIVATE_KEY_ID: str | None = None
    FIREBASE_PRIVATE_KEY: str | None = None
    FIREBASE_CLIENT_EMAIL: str | None = None
    FIREBASE_CLIENT_ID: str | None = None
    FIREBASE_STORAGE_BUCKET: str | None = None

    # n8n MCP Integration (Webhook URLs)
    N8N_WEBHOOK_NOTIFY_ADMIN: str | None = Field(None, description="n8n webhook URL to notify admin of new quote draft")
    N8N_WEBHOOK_DELIVER_QUOTE: str | None = Field(None, description="n8n webhook URL to deliver approved quote to client")
    N8N_API_KEY: str | None = Field(None, description="Optional API key for n8n webhook authentication")
    ADMIN_DASHBOARD_URL: str = Field(default="http://localhost:8501", description="Base URL of the Streamlit admin console")
    
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

    @property
    def api_key(self) -> str:
        """Unified accessor for Gemini API Key."""
        key = self.GEMINI_API_KEY or self.GOOGLE_API_KEY
        if not key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY is missing in environment variables.")
        return key

# Singleton instance
settings = Settings()
