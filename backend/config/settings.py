"""Application settings and path helpers for the backend."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    """Container for runtime settings and important project paths."""

    project_root: Path
    config_dir: Path
    data_dir: Path
    frontend_dir: Path
    providers_file: Path
    database_url: str
    session_store_backend: str
    sse_token_delay_ms: int
    sse_token_chunk_size: int
    title_max_length: int
    thought_filter_enabled: bool
    request_retry_attempts: int
    request_retry_backoff_base: float
    request_retry_max_delay: float
    parallel_model_calls: bool
    provider_request_timeout: float | None
    providers_encryption_key: str | None


def _project_root() -> Path:
    """Resolve the project root based on the current file location."""

    return Path(__file__).resolve().parents[2]


def load_settings() -> Settings:
    """Load settings with environment overrides and derived paths."""

    project_root = _project_root()
    config_dir = project_root / "config"
    data_dir = project_root / "data"
    frontend_dir = project_root / "frontend"
    providers_file = config_dir / "providers.yaml"
    default_database_url = f"sqlite:///{(data_dir / 'chat.db').as_posix()}"
    database_url = os.getenv("DATABASE_URL", default_database_url)
    session_store_backend = os.getenv("SESSION_STORE_BACKEND", "sqlite")
    sse_token_delay_ms = max(0, int(os.getenv("SSE_TOKEN_DELAY_MS", "0")))
    sse_token_chunk_size = max(1, int(os.getenv("SSE_TOKEN_CHUNK_SIZE", "4")))
    title_max_length = max(8, int(os.getenv("TITLE_MAX_LENGTH", "24")))
    thought_filter_enabled = _parse_bool(os.getenv("THOUGHT_FILTER_ENABLED", "true"))
    request_retry_attempts = max(1, int(os.getenv("REQUEST_RETRY_ATTEMPTS", "3")))
    request_retry_backoff_base = max(0.1, float(os.getenv("REQUEST_RETRY_BACKOFF_BASE", "0.5")))
    request_retry_max_delay = max(
        request_retry_backoff_base, float(os.getenv("REQUEST_RETRY_MAX_DELAY", "5"))
    )
    parallel_model_calls = _parse_bool(os.getenv("PARALLEL_MODEL_CALLS", "false"))
    provider_request_timeout_raw = float(os.getenv("PROVIDER_REQUEST_TIMEOUT", "120"))
    provider_request_timeout = (
        None if provider_request_timeout_raw <= 0 else provider_request_timeout_raw
    )
    providers_encryption_key = os.getenv("PROVIDERS_ENC_KEY") or None
    return Settings(
        project_root=project_root,
        config_dir=config_dir,
        data_dir=data_dir,
        frontend_dir=frontend_dir,
        providers_file=providers_file,
        database_url=database_url,
        session_store_backend=session_store_backend,
        sse_token_delay_ms=sse_token_delay_ms,
        sse_token_chunk_size=sse_token_chunk_size,
        title_max_length=title_max_length,
        thought_filter_enabled=thought_filter_enabled,
        request_retry_attempts=request_retry_attempts,
        request_retry_backoff_base=request_retry_backoff_base,
        request_retry_max_delay=request_retry_max_delay,
        parallel_model_calls=parallel_model_calls,
        provider_request_timeout=provider_request_timeout,
        providers_encryption_key=providers_encryption_key,
    )


def _parse_bool(value: str) -> bool:
    """Parse a boolean environment value."""

    normalized = value.strip().lower()
    return normalized in {"1", "true", "yes", "on"}
