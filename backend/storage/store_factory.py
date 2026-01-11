"""Factory helpers for selecting the session store backend."""

from __future__ import annotations

from backend.config.settings import load_settings
from backend.core.session import SessionStore
from backend.storage.session_store import get_session_store as get_database_store


_memory_store_instance: SessionStore | None = None


def get_session_store() -> SessionStore:
    """Return the configured session store implementation."""

    settings = load_settings()
    if settings.session_store_backend.lower() == "memory":
        global _memory_store_instance
        if _memory_store_instance is None:
            _memory_store_instance = SessionStore()
        return _memory_store_instance
    return get_database_store(settings.database_url)
