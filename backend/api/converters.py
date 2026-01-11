"""Conversion helpers between storage records and API schemas."""

from __future__ import annotations

from backend.api.schemas import MessageResponse, SessionDetailResponse, SessionResponse
from backend.core.session import MessageRecord, SessionRecord


def to_message_response(message: MessageRecord) -> MessageResponse:
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


def to_session_response(session: SessionRecord) -> SessionResponse:
    """Convert an internal session record to a response model."""

    return SessionResponse(
        id=session.id,
        title=session.title,
        status=session.status,
        selected_models=session.selected_models,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


def to_session_detail(session: SessionRecord) -> SessionDetailResponse:
    """Convert an internal session record to a detailed response model."""

    return SessionDetailResponse(
        **to_session_response(session).model_dump(),
        messages=[to_message_response(message) for message in session.messages],
    )
