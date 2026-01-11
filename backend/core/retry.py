"""Retry helpers for provider calls."""

from __future__ import annotations

import asyncio
import logging
import random
from dataclasses import dataclass
from typing import Awaitable, Callable, TypeVar

import httpx


T = TypeVar("T")
logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class RetryConfig:
    """Configuration for retry behavior."""

    attempts: int
    backoff_base: float
    max_delay: float


def is_retryable_exception(exc: Exception) -> bool:
    """Return True when the exception should be retried."""

    if isinstance(exc, httpx.HTTPStatusError):
        status = exc.response.status_code
        return status == 429 or status >= 500
    return isinstance(
        exc,
        (
            httpx.TimeoutException,
            httpx.NetworkError,
            httpx.TransportError,
            httpx.RequestError,
        ),
    )


def backoff_delay(config: RetryConfig, attempt: int) -> float:
    """Compute an exponential backoff delay with jitter."""

    base = config.backoff_base * (2 ** max(0, attempt - 1))
    jitter = random.uniform(0.0, 0.2 * base)
    return min(config.max_delay, base + jitter)


async def run_with_retry(
    operation: Callable[[], Awaitable[T]],
    config: RetryConfig,
    *,
    on_retry: Callable[[int, Exception], None] | None = None,
    operation_name: str = "operation",
) -> T:
    """Run an async operation with retries and exponential backoff."""

    last_error: Exception | None = None
    for attempt in range(1, config.attempts + 1):
        try:
            return await operation()
        except Exception as exc:  # noqa: BLE001 - retry controlled here
            last_error = exc
            if not is_retryable_exception(exc) or attempt >= config.attempts:
                break
            if on_retry is not None:
                on_retry(attempt, exc)
            delay = backoff_delay(config, attempt)
            logger.debug(
                "Retrying %s after %.2fs (attempt %s/%s): %s",
                operation_name,
                delay,
                attempt,
                config.attempts,
                exc,
            )
            await asyncio.sleep(delay)
    if last_error is None:
        raise RuntimeError(f"Retry loop exited unexpectedly for {operation_name}.")
    raise last_error
