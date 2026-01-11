"""Abstract base class for LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from backend.api.schemas import ProviderConfig


class BaseProvider(ABC):
    """Base interface for provider implementations."""

    def __init__(self, config: ProviderConfig) -> None:
        """Initialize the provider with its configuration."""

        self._config = config

    @property
    def config(self) -> ProviderConfig:
        """Return the provider configuration."""

        return self._config

    @abstractmethod
    async def generate(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Generate a response from the provider."""

        raise NotImplementedError
