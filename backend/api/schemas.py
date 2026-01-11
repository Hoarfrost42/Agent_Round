"""Pydantic request and response schemas for the backend API."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ModelConfig(BaseModel):
    """Model metadata exposed to the frontend."""

    id: str = Field(..., description="Model identifier, e.g. gpt-4o.")
    display_name: str = Field(..., description="Display name shown in UI.")
    color: str = Field(..., description="Color token for UI.")
    icon: str = Field(..., description="Icon token for UI.")
    prompt: str | None = Field(default=None, description="Model-specific prompt.")


class ProviderConfig(BaseModel):
    """Provider configuration loaded from YAML."""

    id: str = Field(..., description="Provider identifier.")
    name: str = Field(..., description="Provider display name.")
    type: str = Field(..., description="Provider type identifier.")
    api_key: str | None = Field(default=None, description="API key for provider.")
    base_url: str | None = Field(default=None, description="Custom base URL.")
    models: list[ModelConfig] = Field(default_factory=list)


class ProviderUpdateRequest(BaseModel):
    """Update payload for provider configuration."""

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, description="Updated provider name.")
    api_key: str | None = Field(default=None, description="Updated API key.")
    base_url: str | None = Field(default=None, description="Updated base URL.")


class ModelPromptUpdateRequest(BaseModel):
    """Update payload for a model prompt."""

    model_config = ConfigDict(extra="forbid")

    prompt: str | None = Field(..., description="Updated model prompt.")


class ModelPromptResponse(BaseModel):
    """Response payload for a model prompt."""

    provider_id: str
    model_id: str
    prompt: str | None


class HealthResponse(BaseModel):
    """Health check response."""

    status: str = Field(..., description="Health status.")
    timestamp: datetime = Field(..., description="Server timestamp.")


class SessionCreateRequest(BaseModel):
    """Payload for creating a new session."""

    selected_models: list[str] = Field(default_factory=list)


class SessionUpdateRequest(BaseModel):
    """Payload for updating a session."""

    title: str | None = Field(default=None, description="Updated session title.")


class SessionStartRequest(BaseModel):
    """Payload for starting or continuing a session round."""

    user_input: str = Field(..., description="User message to start or continue.")


class SessionResponse(BaseModel):
    """Session summary response."""

    id: str
    title: str
    status: Literal["active", "ended"]
    selected_models: list[str]
    created_at: datetime
    updated_at: datetime


class MessageResponse(BaseModel):
    """Message response returned in session detail."""

    id: str
    session_id: str
    round: int
    role: Literal["user", "assistant"]
    model_id: str | None
    content: str
    timestamp: datetime
    status: Literal["success", "error", "skipped"]


class SessionDetailResponse(SessionResponse):
    """Session detail with message history."""

    messages: list[MessageResponse] = Field(default_factory=list)
