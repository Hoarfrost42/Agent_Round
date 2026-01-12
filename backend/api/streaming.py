"""SSE streaming helpers for session responses."""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass
from typing import AsyncIterator

from backend.config.settings import Settings
from backend.core.filters import StreamingThoughtFilter, filter_thoughts
from backend.core.retry import RetryConfig, backoff_delay, is_retryable_exception, run_with_retry
from backend.core.session import MessageRecord, SessionRecord
from backend.providers.base import BaseProvider
from backend.providers.registry import ProviderRegistry
from backend.storage.store_factory import get_session_store


logger = logging.getLogger(__name__)


@dataclass
class ModelPlan:
    """Execution plan for a model call."""

    model_id: str
    display_name: str | None
    color: str | None
    provider_id: str | None
    prompt: str | None
    provider: BaseProvider | None
    messages: list[dict[str, str]] | None = None
    prefetch_task: asyncio.Task[str] | None = None
    error: Exception | None = None


def format_sse_event(event: str, data: dict[str, object]) -> str:
    """Format an SSE event payload."""

    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def stream_session_round(
    session_id: str,
    session_snapshot: SessionRecord,
    registry: ProviderRegistry,
    settings: Settings,
) -> AsyncIterator[str]:
    """Stream model responses for a session round."""

    store = get_session_store()
    session_messages = list(session_snapshot.messages)
    base_messages = [_message_to_payload(message) for message in session_messages]
    round_index = session_snapshot.current_round
    title_sent = False
    session_title = session_snapshot.title
    retry_config = RetryConfig(
        attempts=settings.request_retry_attempts,
        backoff_base=settings.request_retry_backoff_base,
        max_delay=settings.request_retry_max_delay,
    )

    yield format_sse_event("round_start", {"round": round_index})

    plans = _build_plans(
        session_snapshot,
        registry,
        base_messages,
        settings.parallel_model_calls,
        retry_config,
    )

    for plan in plans:
        if plan.error is not None or plan.provider is None:
            error_message = str(plan.error or "Model not available.")
            yield format_sse_event(
                "model_error",
                {"model": plan.model_id, "error": error_message, "skipped": True},
            )
            yield format_sse_event("model_end", {"model": plan.model_id, "status": "error"})
            _append_error_message(
                store, session_id, session_messages, base_messages, round_index, plan.model_id, error_message
            )
            continue

        yield format_sse_event(
            "model_start",
            {
                "model": plan.model_id,
                "display_name": plan.display_name or plan.model_id,
                "color": plan.color or "gray",
            },
        )

        logger.info(
            "Model request start: model=%s provider=%s streaming=%s",
            plan.model_id,
            plan.provider_id or "unknown",
            plan.provider.supports_streaming,
        )
        start_time = time.perf_counter()
        try:
            if plan.provider.supports_streaming:
                messages = plan.messages or _attach_prompt(base_messages, plan.prompt)
                collected: list[str] = []
                async for chunk in _stream_provider(
                    plan.provider, messages, plan.model_id, settings, retry_config
                ):
                    collected.append(chunk)
                    yield format_sse_event("token", {"content": chunk})
                streamed_text = "".join(collected)
                stored_message = store.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=streamed_text,
                    model_id=plan.model_id,
                    status="success",
                    round_index=round_index,
                )
                session_messages.append(stored_message)
                base_messages.append(_message_to_payload(stored_message))
                yield format_sse_event("model_end", {"model": plan.model_id, "status": "success"})
                if session_title == "New Session" and not title_sent:
                    session_title, title_sent = _maybe_update_title(
                        store,
                        session_id,
                        session_snapshot,
                        session_messages,
                        settings,
                        session_title,
                    )
                    if title_sent:
                        yield format_sse_event("title_generated", {"title": session_title})
            else:
                response_text = await _await_non_stream_response(plan, base_messages, retry_config)
                filtered_text = (
                    filter_thoughts(response_text)
                    if settings.thought_filter_enabled
                    else response_text
                )
                async for chunk in _yield_chunks(
                    filtered_text,
                    settings.sse_token_chunk_size,
                    settings.sse_token_delay_ms,
                ):
                    yield format_sse_event("token", {"content": chunk})
                stored_message = store.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=filtered_text,
                    model_id=plan.model_id,
                    status="success",
                    round_index=round_index,
                )
                session_messages.append(stored_message)
                base_messages.append(_message_to_payload(stored_message))
                yield format_sse_event("model_end", {"model": plan.model_id, "status": "success"})
                if session_title == "New Session" and not title_sent:
                    session_title, title_sent = _maybe_update_title(
                        store,
                        session_id,
                        session_snapshot,
                        session_messages,
                        settings,
                        session_title,
                    )
                    if title_sent:
                        yield format_sse_event("title_generated", {"title": session_title})
            duration = time.perf_counter() - start_time
            logger.info(
                "Model request complete: model=%s provider=%s status=success duration=%.2fs",
                plan.model_id,
                plan.provider_id or "unknown",
                duration,
            )
        except Exception as exc:  # noqa: BLE001 - continue streaming on errors
            duration = time.perf_counter() - start_time
            logger.warning(
                "Model request failed: model=%s provider=%s duration=%.2fs error=%s",
                plan.model_id,
                plan.provider_id or "unknown",
                duration,
                exc,
            )
            error_message = str(exc)
            stored_message = store.add_message(
                session_id=session_id,
                role="assistant",
                content=error_message,
                model_id=plan.model_id,
                status="error",
                round_index=round_index,
            )
            session_messages.append(stored_message)
            base_messages.append(_message_to_payload(stored_message))
            yield format_sse_event(
                "model_error",
                {"model": plan.model_id, "error": error_message, "skipped": True},
            )
            yield format_sse_event("model_end", {"model": plan.model_id, "status": "error"})

    yield format_sse_event("round_end", {"round": round_index, "awaiting_decision": True})
    final_session = store.get_session(session_id)
    if final_session.status == "ended":
        yield format_sse_event("session_end", {"status": "consensus_reached"})


def _build_plans(
    session: SessionRecord,
    registry: ProviderRegistry,
    base_messages: list[dict[str, str]],
    parallel: bool,
    retry_config: RetryConfig,
) -> list[ModelPlan]:
    """Build execution plans for each model."""

    plans: list[ModelPlan] = []
    base_snapshot = list(base_messages)
    for model_id in session.selected_models:
        try:
            provider_config, model_config, provider = registry.resolve_model(model_id)
            plan = ModelPlan(
                model_id=model_id,
                display_name=model_config.display_name,
                color=model_config.color,
                provider_id=provider_config.id,
                prompt=model_config.prompt,
                provider=provider,
            )
            if parallel and not provider.supports_streaming:
                messages = _attach_prompt(base_snapshot, model_config.prompt)
                plan.messages = messages
                plan.prefetch_task = asyncio.create_task(
                    _generate_with_retry(
                        provider,
                        messages,
                        model_id,
                        retry_config,
                        provider_config.id,
                    )
                )
            elif parallel:
                plan.messages = _attach_prompt(base_snapshot, model_config.prompt)
            plans.append(plan)
        except Exception as exc:  # noqa: BLE001 - surface as model error
            plans.append(
                ModelPlan(
                    model_id=model_id,
                    display_name=model_id,
                    color="gray",
                    provider_id=None,
                    prompt=None,
                    provider=None,
                    error=exc,
                )
            )
    return plans


async def _await_non_stream_response(
    plan: ModelPlan, base_messages: list[dict[str, str]], retry_config: RetryConfig
) -> str:
    """Await a non-streaming response, using prefetch when available."""

    if plan.prefetch_task is not None:
        return await plan.prefetch_task
    messages = plan.messages or _attach_prompt(base_messages, plan.prompt)
    return await _generate_with_retry(plan.provider, messages, plan.model_id, retry_config, plan.provider_id)


async def _generate_with_retry(
    provider: BaseProvider,
    messages: list[dict[str, str]],
    model_id: str,
    retry_config: RetryConfig,
    provider_id: str | None,
) -> str:
    """Generate a response with retry."""

    def _log_retry(attempt: int, exc: Exception) -> None:
        logger.warning(
            "Retrying model=%s provider=%s attempt=%s error=%s",
            model_id,
            provider_id or "unknown",
            attempt,
            exc,
        )

    return await run_with_retry(
        lambda: provider.generate(messages, model_id),
        retry_config,
        on_retry=_log_retry,
        operation_name=f"{provider_id or 'provider'}:{model_id}",
    )


async def _stream_provider(
    provider: BaseProvider,
    messages: list[dict[str, str]],
    model_id: str,
    settings: Settings,
    retry_config: RetryConfig,
) -> AsyncIterator[str]:
    """Stream provider output with thought filtering and leading whitespace trimming."""

    thought_filter = StreamingThoughtFilter() if settings.thought_filter_enabled else None
    first_content_seen = False

    async for chunk in _stream_with_retry(provider, messages, model_id, retry_config):
        safe_chunk = thought_filter.feed(chunk) if thought_filter else chunk
        if not safe_chunk:
            continue
        # 跳过开头的纯空白 chunk（修复 Minimax 前导空行问题）
        if not first_content_seen:
            stripped = safe_chunk.lstrip()
            if not stripped:
                continue
            safe_chunk = stripped
            first_content_seen = True
        yield safe_chunk

    if thought_filter is not None:
        tail = thought_filter.flush()
        if tail:
            yield tail


async def _stream_with_retry(
    provider: BaseProvider,
    messages: list[dict[str, str]],
    model_id: str,
    retry_config: RetryConfig,
) -> AsyncIterator[str]:
    """Yield streaming chunks with retry before any output is emitted."""

    attempt = 0
    while True:
        attempt += 1
        yielded = False
        try:
            async for chunk in provider.generate_stream(messages, model_id):
                yielded = True
                yield chunk
            return
        except Exception as exc:  # noqa: BLE001 - controlled retry loop
            if yielded or attempt >= retry_config.attempts or not is_retryable_exception(exc):
                raise
            delay = backoff_delay(retry_config, attempt)
            logger.warning(
                "Streaming retry scheduled for model=%s after %.2fs (attempt %s/%s): %s",
                model_id,
                delay,
                attempt,
                retry_config.attempts,
                exc,
            )
            await asyncio.sleep(delay)


async def _yield_chunks(text: str, chunk_size: int, delay_ms: int) -> AsyncIterator[str]:
    """Yield text chunks for non-streaming providers."""

    for index in range(0, len(text), chunk_size):
        yield text[index : index + chunk_size]
        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000)


def _message_to_payload(message: MessageRecord) -> dict[str, str]:
    """Convert a stored message into provider payload format."""

    return {"role": message.role, "content": message.content}


def _attach_prompt(base_messages: list[dict[str, str]], prompt: str | None) -> list[dict[str, str]]:
    """Attach a system prompt to the base message history."""

    if prompt:
        return [{"role": "system", "content": prompt}] + list(base_messages)
    return list(base_messages)


def _generate_title(session: SessionRecord, max_length: int) -> str:
    """Generate a short title from the session messages."""

    base_text = ""
    for message in session.messages:
        if message.role == "user":
            base_text = message.content
            break
    if not base_text and session.messages:
        base_text = session.messages[0].content
    normalized = " ".join(base_text.strip().split())
    if not normalized:
        normalized = "New Session"
    if len(normalized) > max_length:
        normalized = normalized[:max_length].rstrip() + "..."
    return normalized


def _maybe_update_title(
    store,
    session_id: str,
    session_snapshot: SessionRecord,
    session_messages: list[MessageRecord],
    settings: Settings,
    session_title: str,
) -> tuple[str, bool]:
    """Update the session title when needed."""

    if session_title != "New Session":
        return session_title, False
    session_snapshot.messages = session_messages
    generated = _generate_title(session_snapshot, settings.title_max_length)
    if generated and generated != session_title:
        store.update_title(session_id, generated)
        return generated, True
    return session_title, False


def _append_error_message(
    store,
    session_id: str,
    session_messages: list[MessageRecord],
    base_messages: list[dict[str, str]],
    round_index: int,
    model_id: str,
    error_message: str,
) -> None:
    """Append an error message to storage and in-memory histories."""

    stored_message = store.add_message(
        session_id=session_id,
        role="assistant",
        content=error_message,
        model_id=model_id,
        status="error",
        round_index=round_index,
    )
    session_messages.append(stored_message)
    base_messages.append(_message_to_payload(stored_message))
