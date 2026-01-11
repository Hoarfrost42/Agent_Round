"""Session management API routes."""

from __future__ import annotations

import asyncio
import json

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from backend.api.schemas import (
    MessageResponse,
    SessionCreateRequest,
    SessionDetailResponse,
    SessionResponse,
    SessionStartRequest,
    SessionUpdateRequest,
)
from backend.config.settings import load_settings
from backend.core.context import ContextBuilder
from backend.core.filters import filter_thoughts
from backend.core.session import MessageRecord, SessionRecord
from backend.providers.registry import get_provider_registry
from backend.storage.store_factory import get_session_store


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


def _to_message_response(message: MessageRecord) -> MessageResponse:
    """Convert an internal message record to a response model."""

    return MessageResponse(
        id=message.id,
        session_id=message.session_id,
        round=message.round_index,
        role=message.role,
        model_id=message.model_id,
        content=message.content,
        timestamp=message.timestamp,
        status=message.status,
    )


def _to_session_response(session: SessionRecord) -> SessionResponse:
    """Convert an internal session record to a response model."""

    return SessionResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        selected_models=session.selected_models,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def _to_session_detail(session: SessionRecord) -> SessionDetailResponse:
    """Convert an internal session record to a detailed response."""

    return SessionDetailResponse(
        **_to_session_response(session).model_dump(),
        messages=[_to_message_response(message) for message in session.messages],
    )


def _sse_event(event: str, data: dict[str, object]) -> str:
    """Format an SSE event payload."""

    payload = json.dumps(data, ensure_ascii=False)
    return f"event: {event}\ndata: {payload}\n\n"


async def _stream_chunks(text: str, chunk_size: int, delay_ms: int):
    """Yield chunks of text for simulated streaming."""

    for index in range(0, len(text), chunk_size):
        yield text[index : index + chunk_size]
        if delay_ms > 0:
            await asyncio.sleep(delay_ms / 1000)


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


@router.post("", response_model=SessionResponse)
async def create_session(payload: SessionCreateRequest) -> SessionResponse:
    """Create a new session."""

    store = get_session_store()
    session = store.create_session(payload.selected_models)
    return _to_session_response(session)


@router.get("", response_model=list[SessionResponse])
async def list_sessions() -> list[SessionResponse]:
    """List all sessions."""

    store = get_session_store()
    return [_to_session_response(session) for session in store.list_sessions()]


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str) -> SessionDetailResponse:
    """Get session details including messages."""

    store = get_session_store()
    try:
        session = store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_session_detail(session)


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(session_id: str) -> None:
    """Delete a session."""

    store = get_session_store()
    try:
        store.delete_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.patch("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: str, payload: SessionUpdateRequest
) -> SessionResponse:
    """Update session metadata such as title."""

    if payload.title is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="title is required"
        )
    store = get_session_store()
    try:
        session = store.update_title(session_id, payload.title)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_session_response(session)


@router.post("/{session_id}/start", response_model=SessionDetailResponse)
async def start_session_round(
    session_id: str, payload: SessionStartRequest
) -> SessionDetailResponse:
    """Start the first round of a session."""

    store = get_session_store()
    try:
        round_index = store.start_round(session_id)
        store.add_message(
            session_id=session_id,
            role="user",
            content=payload.user_input,
            round_index=round_index,
        )
        session = store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_session_detail(session)


@router.post("/{session_id}/continue", response_model=SessionDetailResponse)
async def continue_session_round(
    session_id: str, payload: SessionStartRequest
) -> SessionDetailResponse:
    """Continue to the next round of a session."""

    store = get_session_store()
    try:
        round_index = store.continue_round(session_id)
        store.add_message(
            session_id=session_id,
            role="user",
            content=payload.user_input,
            round_index=round_index,
        )
        session = store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_session_detail(session)


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(session_id: str) -> SessionResponse:
    """End an active session."""

    store = get_session_store()
    try:
        session = store.end_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_session_response(session)


@router.get("/{session_id}/stream")
async def stream_session(session_id: str) -> StreamingResponse:
    """Stream model responses for the current round using SSE."""

    settings = load_settings()
    store = get_session_store()
    registry = get_provider_registry()
    try:
        session_snapshot = store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    if session_snapshot.current_round == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session has no active round. Start the session first.",
        )
    session_messages = list(session_snapshot.messages)
    session_title = session_snapshot.title

    async def event_generator():
        """Yield SSE events for the current round."""

        nonlocal session_title
        round_index = session_snapshot.current_round
        title_sent = False
        yield _sse_event("round_start", {"round": round_index})
        for model_id in session_snapshot.selected_models:
            try:
                _, model_config, provider = registry.resolve_model(model_id)
                yield _sse_event(
                    "model_start",
                    {
                        "model": model_id,
                        "display_name": model_config.display_name,
                        "color": model_config.color,
                    },
                )
                messages = ContextBuilder(system_prompt=model_config.prompt).build_messages(
                    session_messages
                )
                response_text = await provider.generate(messages, model_id)
                filtered_text = (
                    filter_thoughts(response_text)
                    if settings.thought_filter_enabled
                    else response_text
                )
                async for chunk in _stream_chunks(
                    filtered_text, settings.sse_token_chunk_size, settings.sse_token_delay_ms
                ):
                    yield _sse_event("token", {"content": chunk})
                stored_message = store.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=filtered_text,
                    model_id=model_id,
                    status="success",
                    round_index=round_index,
                )
                session_messages.append(stored_message)
                yield _sse_event("model_end", {"model": model_id, "status": "success"})
                if not title_sent and session_title == "New Session":
                    session_snapshot.messages = session_messages
                    generated = _generate_title(session_snapshot, settings.title_max_length)
                    if generated and generated != session_title:
                        store.update_title(session_id, generated)
                        session_title = generated
                        title_sent = True
                        yield _sse_event("title_generated", {"title": generated})
            except Exception as exc:  # noqa: BLE001 - stream continues on provider errors
                error_message = str(exc)
                stored_message = store.add_message(
                    session_id=session_id,
                    role="assistant",
                    content=error_message,
                    model_id=model_id,
                    status="error",
                    round_index=round_index,
                )
                session_messages.append(stored_message)
                yield _sse_event(
                    "model_error",
                    {"model": model_id, "error": error_message, "skipped": True},
                )
                yield _sse_event("model_end", {"model": model_id, "status": "error"})
        yield _sse_event("round_end", {"round": round_index, "awaiting_decision": True})
        final_session = store.get_session(session_id)
        if final_session.status == "ended":
            yield _sse_event("session_end", {"status": "consensus_reached"})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )
