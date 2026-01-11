"""Google provider placeholder implementation."""

from __future__ import annotations

from typing import Any

from backend.providers.base import BaseProvider


class GoogleProvider(BaseProvider):
    """Provider stub for Google API integration (not implemented)."""

    async def generate(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Generate a response using Google API (not implemented)."""

        raise NotImplementedError(
            "Google provider is not implemented yet. "
            "Please use OpenAI/Ollama or implement the Google integration."
        )
