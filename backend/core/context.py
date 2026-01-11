"""Context assembly for provider calls."""

from __future__ import annotations

from dataclasses import dataclass

from backend.core.session import MessageRecord


@dataclass
class ContextBuilder:
    """Build provider message payloads from session history."""

    system_prompt: str | None = None

    def build_messages(self, history: list[MessageRecord]) -> list[dict[str, str]]:
        """Convert internal message records to provider payloads."""

        messages: list[dict[str, str]] = []
        if self.system_prompt:
            messages.append({"role": "system", "content": self.system_prompt})
        for message in history:
            messages.append({"role": message.role, "content": message.content})
        return messages
