"""Session management API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import StreamingResponse

from backend.api.schemas import (
    SessionCreateRequest,
    SessionDetailResponse,
    SessionResponse,
    SessionStartRequest,
    SessionUpdateRequest,
)
from backend.api.converters import to_session_detail, to_session_response
from backend.api.streaming import stream_session_round
from backend.config.settings import load_settings
from backend.providers.registry import get_provider_registry
from backend.storage.store_factory import get_session_store


router = APIRouter(prefix="/api/sessions", tags=["sessions"])


@router.post("", response_model=SessionResponse)
async def create_session(payload: SessionCreateRequest) -> SessionResponse:
    """Create a new session."""

    store = get_session_store()
    session = store.create_session(payload.selected_models)
    return to_session_response(session)


@router.get("", response_model=list[SessionResponse])
async def list_sessions() -> list[SessionResponse]:
    """List all sessions."""

    store = get_session_store()
    return [to_session_response(session) for session in store.list_sessions()]


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session(session_id: str) -> SessionDetailResponse:
    """Get session details including messages."""

    store = get_session_store()
    try:
        session = store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_session_detail(session)


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
    return to_session_response(session)


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
    return to_session_detail(session)


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
    return to_session_detail(session)


@router.post("/{session_id}/end", response_model=SessionResponse)
async def end_session(session_id: str) -> SessionResponse:
    """End an active session."""

    store = get_session_store()
    try:
        session = store.end_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return to_session_response(session)


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
    return StreamingResponse(
        stream_session_round(session_id, session_snapshot, registry, settings),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@router.get("/{session_id}/export")
async def export_session(session_id: str) -> StreamingResponse:
    """Export session as Markdown report."""
    from datetime import datetime

    store = get_session_store()
    try:
        session = store.get_session(session_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc

    # Build Markdown content
    lines: list[str] = []
    lines.append(f"# {session.title}")
    lines.append("")
    lines.append(f"> 导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"> 参与模型: {', '.join(session.selected_models)}")
    lines.append("")
    lines.append("---")
    lines.append("")

    current_round = 0
    for msg in session.messages:
        # Round separator
        if msg.round_index > current_round:
            current_round = msg.round_index
            lines.append(f"## 第 {current_round} 轮讨论")
            lines.append("")

        if msg.role == "user":
            lines.append(f"### 👤 用户")
            lines.append("")
            lines.append(msg.content)
            lines.append("")
        else:
            model_name = msg.model_id.split("/")[-1] if "/" in msg.model_id else msg.model_id
            lines.append(f"### 🤖 {model_name}")
            lines.append("")
            lines.append(msg.content)
            lines.append("")

    content = "\n".join(lines)
    from urllib.parse import quote
    # URL 编码文件名，解决中文字符问题
    raw_filename = f"{session.title or 'session'}_{session_id[:8]}.md"
    encoded_filename = quote(raw_filename, safe='')

    return StreamingResponse(
        iter([content.encode('utf-8')]),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
        },
    )
