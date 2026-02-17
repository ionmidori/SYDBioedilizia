from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    """
    Centralized configuration for the application.
    Enforces strict typing and validation of environment variables.
    """
    ENV: str = Field(default="development", description="Environment: development, production")
    PROJECT_ID: str = Field(default="chatbotluca-a8a73", description="Google Cloud Project ID")
    
    # Secrets
    # We allow None during init if .env is missing, but logic should check them.
    # Ideally, we enforce them.
    GEMINI_API_KEY: str | None = Field(None, description="Required for Gemini AI models")
    GOOGLE_API_KEY: str | None = Field(None, description="Legacy alias for GEMINI_API_KEY")
    PERPLEXITY_API_KEY: str | None = Field(None, description="Required for Market Prices")
    
    # Feature Flags (App Check enabled by default for production safety)
    ENABLE_APP_CHECK: bool = Field(default=True, description="Enable Firebase App Check (set to false for local dev)")
    
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
    
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8",
        extra="ignore"  # Allow extra keys in .env
    )

    @property
    def api_key(self) -> str:
        """Unified accessor for Gemini API Key."""
        key = self.GEMINI_API_KEY or self.GOOGLE_API_KEY
        if not key:
            raise ValueError("GEMINI_API_KEY or GOOGLE_API_KEY is missing in environment variables.")
        return key

# Singleton instance
settings = Settings()
