"""SQLite-backed session store implementation."""

from __future__ import annotations

from pathlib import Path
from typing import Iterable
from uuid import uuid4

from sqlalchemy import desc, func, select

from backend.core.round import RoundState
from backend.core.session import MessageRecord, SessionRecord, _utc_now
from backend.storage.database import DatabaseManager
from backend.storage.models import MessageModel, SessionModel


def _session_record_from_model(
    model: SessionModel, messages: list[MessageRecord] | None = None
) -> SessionRecord:
    """Convert a session ORM model into a session record."""

    message_list = messages or []
    current_round = max((message.round_index for message in message_list), default=0)
    return SessionRecord(
        id=model.id,
        title=model.title,
        status=model.status,
        selected_models=list(model.selected_models or []),
        created_at=model.created_at,
        updated_at=model.updated_at,
        messages=message_list,
        round_state=RoundState(current_round=current_round),
    )


def _message_record_from_model(model: MessageModel) -> MessageRecord:
    """Convert a message ORM model into a message record."""

    return MessageRecord(
        id=model.id,
        session_id=model.session_id,
        round_index=model.round_index,
        role=model.role,
        model_id=model.model_id,
        content=model.content,
        timestamp=model.timestamp,
        status=model.status,
    )


class DatabaseSessionStore:
    """SQLite-backed session store."""

    def __init__(self, database_url: str) -> None:
        """Initialize the store and ensure tables exist."""

        if database_url.startswith("sqlite:///"):
            database_path = Path(database_url.replace("sqlite:///", "", 1))
            database_path.parent.mkdir(parents=True, exist_ok=True)
        self._database = DatabaseManager(database_url)
        self._database.create_tables()

    def create_session(self, selected_models: Iterable[str]) -> SessionRecord:
        """Create a new session with selected models."""

        now = _utc_now()
        session_id = uuid4().hex
        model = SessionModel(
            id=session_id,
            title="New Session",
            status="active",
            selected_models=list(selected_models),
            created_at=now,
            updated_at=now,
        )
        with self._database.get_session() as db_session:
            db_session.add(model)
            db_session.commit()
        return _session_record_from_model(model, [])

    def list_sessions(self) -> list[SessionRecord]:
        """Return all sessions sorted by updated time."""

        with self._database.get_session() as db_session:
            result = db_session.scalars(select(SessionModel).order_by(desc(SessionModel.updated_at)))
            return [_session_record_from_model(model, []) for model in result.all()]

    def get_session(self, session_id: str) -> SessionRecord:
        """Fetch a session by id including messages."""

        with self._database.get_session() as db_session:
            model = db_session.get(SessionModel, session_id)
            if model is None:
                raise KeyError(f"Session not found: {session_id}")
            messages = db_session.scalars(
                select(MessageModel)
                .where(MessageModel.session_id == session_id)
                .order_by(MessageModel.timestamp)
            ).all()
            message_records = [_message_record_from_model(message) for message in messages]
            return _session_record_from_model(model, message_records)

    def delete_session(self, session_id: str) -> None:
        """Delete a session by id."""

        with self._database.get_session() as db_session:
            model = db_session.get(SessionModel, session_id)
            if model is None:
                raise KeyError(f"Session not found: {session_id}")
            db_session.delete(model)
            db_session.commit()

    def update_title(self, session_id: str, title: str) -> SessionRecord:
        """Update the session title."""

        with self._database.get_session() as db_session:
            model = db_session.get(SessionModel, session_id)
            if model is None:
                raise KeyError(f"Session not found: {session_id}")
            model.title = title
            model.updated_at = _utc_now()
            db_session.commit()
            return _session_record_from_model(model, [])

    def start_round(self, session_id: str) -> int:
        """Start the first round for a session."""

        with self._database.get_session() as db_session:
            model = db_session.get(SessionModel, session_id)
            if model is None:
                raise KeyError(f"Session not found: {session_id}")
            current_round = self._get_current_round(db_session, session_id)
            round_index = 1 if current_round == 0 else current_round
            model.updated_at = _utc_now()
            db_session.commit()
            return round_index

    def continue_round(self, session_id: str) -> int:
        """Advance to the next round for a session."""

        with self._database.get_session() as db_session:
            model = db_session.get(SessionModel, session_id)
            if model is None:
                raise KeyError(f"Session not found: {session_id}")
            current_round = self._get_current_round(db_session, session_id)
            round_index = current_round + 1
            model.updated_at = _utc_now()
            db_session.commit()
            return round_index

    def end_session(self, session_id: str) -> SessionRecord:
        """Mark a session as ended."""

        with self._database.get_session() as db_session:
            model = db_session.get(SessionModel, session_id)
            if model is None:
                raise KeyError(f"Session not found: {session_id}")
            model.status = "ended"
            model.updated_at = _utc_now()
            db_session.commit()
            return _session_record_from_model(model, [])

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

        with self._database.get_session() as db_session:
            session_model = db_session.get(SessionModel, session_id)
            if session_model is None:
                raise KeyError(f"Session not found: {session_id}")
            resolved_round = round_index or max(self._get_current_round(db_session, session_id), 1)
            message_model = MessageModel(
                id=uuid4().hex,
                session_id=session_id,
                round_index=resolved_round,
                role=role,
                model_id=model_id,
                content=content,
                timestamp=_utc_now(),
                status=status,
            )
            session_model.updated_at = _utc_now()
            db_session.add(message_model)
            db_session.commit()
            return _message_record_from_model(message_model)

    @staticmethod
    def _get_current_round(db_session, session_id: str) -> int:
        """Return the current round for a session from stored messages."""

        result = db_session.execute(
            select(func.max(MessageModel.round_index)).where(MessageModel.session_id == session_id)
        ).scalar()
        return int(result or 0)


_db_store_instance: DatabaseSessionStore | None = None


def get_session_store(database_url: str) -> DatabaseSessionStore:
    """Return a singleton database-backed session store."""

    global _db_store_instance
    if _db_store_instance is None:
        _db_store_instance = DatabaseSessionStore(database_url)
    return _db_store_instance
