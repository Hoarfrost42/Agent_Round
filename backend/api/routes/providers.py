"""Provider-related API routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from backend.api.schemas import (
    ModelPromptResponse,
    ModelPromptUpdateRequest,
    ProviderConfig,
    ProviderUpdateRequest,
    ModelConfig,
)
from backend.providers.registry import get_provider_registry


router = APIRouter(prefix="/api/providers", tags=["providers"])


@router.get("", response_model=list[ProviderConfig])
async def list_providers() -> list[ProviderConfig]:
    """Return all configured providers."""

    registry = get_provider_registry()
    return registry.list_configs()


@router.post("/reload", response_model=list[ProviderConfig])
async def reload_providers() -> list[ProviderConfig]:
    """Reload provider configuration from YAML."""

    registry = get_provider_registry()
    return registry.load()


@router.get("/{provider_id}", response_model=ProviderConfig)
async def get_provider(provider_id: str) -> ProviderConfig:
    """Return a provider configuration by id."""

    registry = get_provider_registry()
    try:
        return registry.get_config(provider_id)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{provider_id}", response_model=ProviderConfig)
async def update_provider(
    provider_id: str, payload: ProviderUpdateRequest
) -> ProviderConfig:
    """Update provider configuration fields."""

    registry = get_provider_registry()
    try:
        return registry.update_config(provider_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/{provider_id}/models/{model_id:path}/prompt", response_model=ModelPromptResponse)
async def get_model_prompt(provider_id: str, model_id: str) -> ModelPromptResponse:
    """Get the prompt configured for a model."""

    registry = get_provider_registry()
    try:
        provider = registry.get_config(provider_id)
        for model in provider.models:
            if model.id == model_id:
                return ModelPromptResponse(
                    provider_id=provider_id, model_id=model_id, prompt=model.prompt
                )
        raise KeyError(f"Model not found: {model_id}")
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.put("/{provider_id}/models/{model_id:path}/prompt", response_model=ModelPromptResponse)
async def update_model_prompt(
    provider_id: str, model_id: str, payload: ModelPromptUpdateRequest
) -> ModelPromptResponse:
    """Update the prompt for a model."""

    registry = get_provider_registry()
    try:
        model = registry.update_model_prompt(provider_id, model_id, payload.prompt)
        return ModelPromptResponse(
            provider_id=provider_id, model_id=model.id, prompt=model.prompt
        )
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.post("", response_model=ProviderConfig, status_code=status.HTTP_201_CREATED)
async def create_provider(payload: ProviderConfig) -> ProviderConfig:
    """Create a new provider configuration."""

    registry = get_provider_registry()
    try:
        return registry.add_provider(payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/{provider_id}/models", response_model=ModelConfig, status_code=status.HTTP_201_CREATED)
async def add_model_to_provider(provider_id: str, payload: ModelConfig) -> ModelConfig:
    """Add a new model to an existing provider."""

    registry = get_provider_registry()
    try:
        return registry.add_model(provider_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
