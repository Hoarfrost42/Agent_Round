"""Session storage and lifecycle management.

The in-memory SessionStore is kept as a legacy fallback (mainly for testing or
when SESSION_STORE_BACKEND=memory). Production should use the SQLite store.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Iterable
from uuid import uuid4

from backend.core.round import RoundScheduler, RoundState


def _utc_now() -> datetime:
    """Return the current UTC time."""

    return datetime.now(timezone.utc)


@dataclass
class MessageRecord:
    """Internal representation of a message in a session."""

    id: str
    session_id: str
    round_index: int
    role: str
    model_id: str | None
    content: str
    timestamp: datetime
    status: str


@dataclass
class SessionRecord:
    """Internal representation of a conversation session."""

    id: str
    title: str
    status: str
    selected_models: list[str]
    created_at: datetime
    updated_at: datetime
    messages: list[MessageRecord] = field(default_factory=list)
    round_state: RoundState = field(default_factory=RoundState)

    @property
    def current_round(self) -> int:
        """Return the current round number."""

        return self.round_state.current_round


class SessionStore:
    """Legacy in-memory session store for the backend."""

    def __init__(self) -> None:
        """Initialize the in-memory store."""

        self._sessions: dict[str, SessionRecord] = {}
        self._lock = RLock()

    def create_session(self, selected_models: Iterable[str]) -> SessionRecord:
        """Create a new session with selected models."""

        now = _utc_now()
        session_id = uuid4().hex
        session = SessionRecord(
            id=session_id,
            title="New Session",
            status="active",
            selected_models=list(selected_models),
            created_at=now,
            updated_at=now,
        )
        with self._lock:
            self._sessions[session_id] = session
        return session

    def list_sessions(self) -> list[SessionRecord]:
        """Return all sessions sorted by updated time."""

        with self._lock:
            sessions = list(self._sessions.values())
        return sorted(sessions, key=lambda item: item.updated_at, reverse=True)

    def get_session(self, session_id: str) -> SessionRecord:
        """Fetch a session by id."""

        with self._lock:
            if session_id not in self._sessions:
                raise KeyError(f"Session not found: {session_id}")
            return self._sessions[session_id]

    def delete_session(self, session_id: str) -> None:
        """Delete a session by id."""

        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                return
        raise KeyError(f"Session not found: {session_id}")

    def update_title(self, session_id: str, title: str) -> SessionRecord:
        """Update the session title."""

        with self._lock:
            session = self.get_session(session_id)
            session.title = title
            session.updated_at = _utc_now()
            return session

    def start_round(self, session_id: str) -> int:
        """Start the first round for a session."""

        with self._lock:
            session = self.get_session(session_id)
            scheduler = RoundScheduler(session.round_state)
            round_index = scheduler.start_first_round()
            session.updated_at = _utc_now()
            return round_index

    def continue_round(self, session_id: str) -> int:
        """Advance to the next round for a session."""

        with self._lock:
            session = self.get_session(session_id)
            scheduler = RoundScheduler(session.round_state)
            round_index = scheduler.advance_round()
            session.updated_at = _utc_now()
            return round_index

    def end_session(self, session_id: str) -> SessionRecord:
        """Mark a session as ended."""

        with self._lock:
            session = self.get_session(session_id)
            session.status = "ended"
            session.updated_at = _utc_now()
            return session

    def add_message(
        self,
        session_id: str,
        role: str,
        content: str,
        model_id: str | None = None,
        status: str = "success",
        round_index: int | None = None,
    ) -> MessageRecord:
        """Add a message to a session and return the stored record."""

        with self._lock:
            session = self.get_session(session_id)
            resolved_round = round_index or max(session.current_round, 1)
            message = MessageRecord(
                id=uuid4().hex,
                session_id=session_id,
                round_index=resolved_round,
                role=role,
                model_id=model_id,
                content=content,
                timestamp=_utc_now(),
                status=status,
            )
            session.messages.append(message)
            session.updated_at = _utc_now()
            return message


_session_store_instance: SessionStore | None = None


def get_session_store() -> SessionStore:
    """Return the singleton session store."""

    global _session_store_instance
    if _session_store_instance is None:
        _session_store_instance = SessionStore()
    return _session_store_instance
