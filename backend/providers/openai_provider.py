"""OpenAI-compatible provider implementation."""

from __future__ import annotations

from typing import Any

import httpx

from backend.providers.base import BaseProvider


DEFAULT_BASE_URL = "https://api.openai.com"


def _build_chat_completions_url(base_url: str | None) -> str:
    """Build the chat completions endpoint URL from a base URL."""

    resolved_base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    if resolved_base.endswith("/v1"):
        return f"{resolved_base}/chat/completions"
    return f"{resolved_base}/v1/chat/completions"


class OpenAIProvider(BaseProvider):
    """Provider for OpenAI-compatible chat completions APIs."""

    async def generate(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Generate a chat completion using an OpenAI-compatible API."""

        if not self.config.api_key:
            raise ValueError("API key is required for OpenAI provider.")
        payload: dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        url = _build_chat_completions_url(self.config.base_url)
        headers = {"Authorization": f"Bearer {self.config.api_key}"}
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("OpenAI response missing choices.")
        message = choices[0].get("message", {})
        content = message.get("content")
        if not content:
            raise RuntimeError("OpenAI response missing message content.")
        return str(content)
