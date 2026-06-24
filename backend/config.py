"""
CityPulse CRM — Backend Configuration
Loads environment variables and provides app-wide settings.
"""

from pydantic_settings import BaseSettings
from typing import List


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

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

    @property
    def cors_origin_list(self) -> List[str]:
        return [origin.strip() for origin in self.cors_origins.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
