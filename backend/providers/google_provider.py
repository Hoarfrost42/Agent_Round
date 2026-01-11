"""Google Gemini provider implementation."""

from __future__ import annotations

import json
import logging
from typing import Any, AsyncIterator

import httpx

from backend.config.settings import load_settings
from backend.providers.base import BaseProvider


DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
logger = logging.getLogger(__name__)


def _build_generate_url(base_url: str | None, model_id: str, stream: bool) -> str:
    """Build the Gemini generate endpoint URL."""

    resolved_base = (base_url or DEFAULT_BASE_URL).rstrip("/")
    if not resolved_base.endswith(("/v1beta", "/v1")):
        resolved_base = f"{resolved_base}/v1beta"
    suffix = "streamGenerateContent" if stream else "generateContent"
    url = f"{resolved_base}/models/{model_id}:{suffix}"
    if stream:
        return f"{url}?alt=sse"
    return url


def _split_system_instruction(
    messages: list[dict[str, Any]],
) -> tuple[str | None, list[dict[str, Any]]]:
    """Split system prompts from message history."""

    system_parts: list[str] = []
    other_messages: list[dict[str, Any]] = []
    for message in messages:
        if message.get("role") == "system":
            content = str(message.get("content") or "")
            if content:
                system_parts.append(content)
        else:
            other_messages.append(message)
    system_instruction = "\n".join(system_parts).strip() if system_parts else None
    return system_instruction or None, other_messages


def _build_contents(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build Gemini content payload from chat messages."""

    role_map = {"user": "user", "assistant": "model"}
    contents: list[dict[str, Any]] = []
    for message in messages:
        role = role_map.get(message.get("role", "user"), "user")
        content = str(message.get("content") or "")
        if not content:
            continue
        contents.append({"role": role, "parts": [{"text": content}]})
    # 确保第一条消息是 user
    if contents and contents[0]["role"] == "model":
        contents.insert(0, {"role": "user", "parts": [{"text": " "}]})
    # 关键修复：当最后一条消息是 model 时，添加请求回复的 user 消息
    # 这解决了多模型圆桌场景下 Gemini 认为对话已结束而返回空内容的问题
    if contents and contents[-1]["role"] == "model":
        contents.append({
            "role": "user",
            "parts": [{"text": "请你作为本次圆桌讨论的参与者，提供你自己独特的分析和见解。"}]
        })
    return contents


def _extract_text(payload: dict[str, Any]) -> str:
    """Extract text content from a Gemini response payload."""

    texts: list[str] = []
    for candidate in payload.get("candidates", []) or []:
        content = candidate.get("content", {})
        for part in content.get("parts", []) or []:
            text = part.get("text")
            if text:
                texts.append(str(text))
    return "".join(texts)


class GoogleProvider(BaseProvider):
    """Provider for Google Gemini APIs."""

    @property
    def supports_streaming(self) -> bool:
        """Return True because Gemini supports streaming."""

        return True

    async def generate(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> str:
        """Generate a response using the Gemini API."""

        if not self.config.api_key:
            raise ValueError("API key is required for Google provider.")
        system_instruction, chat_messages = _split_system_instruction(messages)
        payload: dict[str, Any] = {
            "contents": _build_contents(chat_messages),
            "generationConfig": {"temperature": temperature},
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        if max_tokens is not None:
            payload["generationConfig"]["maxOutputTokens"] = max_tokens
        url = _build_generate_url(self.config.base_url, model_id, stream=False)
        headers = {"x-goog-api-key": self.config.api_key}
        timeout = _resolve_timeout()
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            data = response.json()
        logger.debug("Gemini response payload: %s", data)
        content = _extract_text(data)
        if not content:
            raise RuntimeError("Gemini response missing content.")
        return content

    async def generate_stream(
        self,
        messages: list[dict[str, Any]],
        model_id: str,
        temperature: float = 0.7,
        max_tokens: int | None = None,
    ) -> AsyncIterator[str]:
        """Stream Gemini response chunks."""

        if not self.config.api_key:
            raise ValueError("API key is required for Google provider.")
        system_instruction, chat_messages = _split_system_instruction(messages)
        payload: dict[str, Any] = {
            "contents": _build_contents(chat_messages),
            "generationConfig": {"temperature": temperature},
        }
        if system_instruction:
            payload["systemInstruction"] = {"parts": [{"text": system_instruction}]}
        if max_tokens is not None:
            payload["generationConfig"]["maxOutputTokens"] = max_tokens
        url = _build_generate_url(self.config.base_url, model_id, stream=True)
        headers = {"x-goog-api-key": self.config.api_key}
        timeout = _resolve_timeout()
        chunk_count = 0
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
                        chunk_text = _extract_text(event)
                        if chunk_text:
                            chunk_count += 1
                            yield chunk_text
        logger.debug("Gemini stream finished: model=%s chunks=%s", model_id, chunk_count)


def _resolve_timeout() -> httpx.Timeout | None:
    """Return a request timeout for provider calls."""

    settings = load_settings()
    if settings.provider_request_timeout is None:
        return None
    return httpx.Timeout(settings.provider_request_timeout)
