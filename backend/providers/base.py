"""Abstract base class for LLM providers."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, AsyncIterator

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

    @property
    def supports_streaming(self) -> bool:
        """Return True if the provider supports real-time streaming."""

        return False

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

    async def generate_stream(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Stream response chunks from the provider."""

        yield await self.generate(messages, model_id, temperature, max_tokens)
