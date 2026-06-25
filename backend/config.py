"""
CityPulse CRM — Backend Configuration
Loads environment variables and provides app-wide settings.
"""

from pydantic import model_validator
from pydantic_settings import BaseSettings
from typing import List

# Insecure placeholder values that must never be used in production.
_INSECURE_API_KEYS = {"", "dev-secret-key-123", "changeme"}


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # Deployment environment: "development" (default) or "production".
    app_env: str = "development"

    # Supabase (Postgres + Auth)
    supabase_url: str
    supabase_service_role_key: str

    # Third-party APIs
    serpapi_key: str | None = None
    gemini_api_key: str

    # Free LLM fallback (Groq) — used when Gemini errors or is over its daily cap
    groq_api_key: str | None = None
    groq_model: str = "llama-3.3-70b-versatile"

    # Security
    backend_api_key: str = "dev-secret-key-123"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # FinOps Limits (spec: 03-Security-and-Compliance.md)
    max_gemini_calls_per_day: int = 50
    max_scraper_runs_per_day: int = 20

    # API hardening (B2): per-route rate limits (slowapi syntax), request body
    # cap, and the staleness window after which the DLQ worker is considered
    # unhealthy for the readiness probe.
    scrape_rate_limit: str = "10/minute"
    score_rate_limit: str = "20/minute"
    max_request_bytes: int = 65536  # 64 KB — generous for our small JSON bodies
    dlq_heartbeat_max_age_seconds: int = 180  # 3x the 60s worker loop interval

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    @model_validator(mode="after")
    def _guard_production_secrets(self) -> "Settings":
        """Fail closed: refuse to start in production with an insecure API key."""
        if self.app_env == "production" and self.backend_api_key in _INSECURE_API_KEYS:
            raise ValueError(
                "BACKEND_API_KEY must be set to a strong, non-default value when "
                "APP_ENV=production (got an insecure placeholder)."
            )
        return self

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
