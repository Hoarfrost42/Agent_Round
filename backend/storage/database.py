"""SQLAlchemy database setup utilities."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker


Base = declarative_base()


class DatabaseManager:
    """Manage SQLAlchemy engine and sessions."""

    def __init__(self, database_url: str) -> None:
        """Initialize the database manager with a URL."""

        connect_args = {}
        if database_url.startswith("sqlite"):
            connect_args = {"check_same_thread": False}
        self._engine = create_engine(database_url, future=True, connect_args=connect_args)
        self._session_factory = sessionmaker(
            bind=self._engine,
            autoflush=False,
            autocommit=False,
            expire_on_commit=False,
        )

    def create_tables(self) -> None:
        """Create all tables defined on the Base metadata."""

        Base.metadata.create_all(self._engine)

    def get_session(self):
        """Return a new SQLAlchemy session."""

        return self._session_factory()
