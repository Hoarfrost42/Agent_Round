"""OpenAI-compatible provider implementation."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from backend.config.settings import load_settings
from backend.providers.base import BaseProvider


DEFAULT_BASE_URL = "https://api.openai.com"
logger = logging.getLogger(__name__)


def _build_chat_completions_url(base_url: str | None) -> str:
    """Build the chat completions endpoint URL from a base URL."""

    resolved_base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    if resolved_base.endswith("/v1"):
        return f"{resolved_base}/chat/completions"
    return f"{resolved_base}/v1/chat/completions"


class OpenAIProvider(BaseProvider):
    """Provider for OpenAI-compatible chat completions APIs."""

    @property
    def supports_streaming(self) -> bool:
        """Return True because OpenAI-compatible APIs support streaming."""

        return True

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
        timeout = _resolve_timeout()
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        logger.debug("OpenAI response payload: %s", data)
        choices = data.get("choices", [])
        if not choices:
            raise RuntimeError("OpenAI response missing choices.")
        message = choices[0].get("message", {})
        content = message.get("content")
        if not content:
            raise RuntimeError("OpenAI response missing message content.")
        return str(content)

    async def generate_stream(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Stream chat completion chunks using an OpenAI-compatible API."""

        if not self.config.api_key:
            raise ValueError("API key is required for OpenAI provider.")
        payload: dict[str, Any] = {
            "model": model_id,
            "messages": messages,
            "temperature": temperature,
            "stream": True,
        }
        if max_tokens is not None:
            payload["max_tokens"] = max_tokens
        url = _build_chat_completions_url(self.config.base_url)
        headers = {"Authorization": f"Bearer {self.config.api_key}"}
        timeout = _resolve_timeout()
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line:
                        continue
                    if line.startswith("data:"):
                        data_str = line[len("data:") :].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            event = json.loads(data_str)
                        except json.JSONDecodeError:
                            continue
                        choices = event.get("choices", [])
                        if not choices:
                            continue
                        delta = choices[0].get("delta", {})
                        content = delta.get("content")
                        if content:
                            yield str(content)


def _resolve_timeout() -> httpx.Timeout | None:
    """Return a request timeout for provider calls."""

    settings = load_settings()
    if settings.provider_request_timeout is None:
        return None
    return httpx.Timeout(settings.provider_request_timeout)
