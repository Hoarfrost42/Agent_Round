"""SQLAlchemy ORM models for sessions and messages."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from backend.storage.database import Base


class SessionModel(Base):
    """Session ORM model."""

    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    title: Mapped[str] = mapped_column(String, default="New Session")
    status: Mapped[str] = mapped_column(String, default="active")
    selected_models: Mapped[list[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list["MessageModel"]] = relationship(
        "MessageModel", back_populates="session", cascade="all, delete-orphan"
    )


class MessageModel(Base):
    """Message ORM model."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("sessions.id"))
    round_index: Mapped[int] = mapped_column(Integer)
    role: Mapped[str] = mapped_column(String)
    model_id: Mapped[str | None] = mapped_column(String, nullable=True)
    content: Mapped[str] = mapped_column(Text)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String, default="success")

    session: Mapped[SessionModel] = relationship("SessionModel", back_populates="messages")
