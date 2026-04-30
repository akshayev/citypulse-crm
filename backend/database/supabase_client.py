"""
CityPulse CRM — Supabase Client (Singleton)
Source: 01-System-Architecture.md
"""
from supabase import create_client, Client
from backend.config import settings

_supabase_client: Client | None = None


def get_supabase_client() -> Client:
    """Get or create the singleton Supabase client using service role key."""
    global _supabase_client
    if _supabase_client is None:
        _supabase_client = create_client(
            settings.supabase_url,
            settings.supabase_service_role_key
        )
    return _supabase_client
