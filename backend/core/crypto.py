"""Encryption helpers for provider secrets."""

from __future__ import annotations

from dataclasses import dataclass

from cryptography.fernet import Fernet, InvalidToken


ENC_PREFIX = "enc:"


@dataclass(frozen=True)
class ProviderCrypto:
    """Encrypt/decrypt provider secrets using Fernet."""

    key: str

    def __post_init__(self) -> None:
        """Validate that a key is supplied."""

        if not self.key:
            raise ValueError("Encryption key is required.")

    def encrypt(self, value: str) -> str:
        """Encrypt a plaintext value."""

        fernet = Fernet(self.key.encode("utf-8"))
        token = fernet.encrypt(value.encode("utf-8")).decode("utf-8")
        return f"{ENC_PREFIX}{token}"

    def decrypt(self, value: str) -> str:
        """Decrypt an encrypted value."""

        if not value.startswith(ENC_PREFIX):
            return value
        token = value[len(ENC_PREFIX) :]
        fernet = Fernet(self.key.encode("utf-8"))
        try:
            return fernet.decrypt(token.encode("utf-8")).decode("utf-8")
        except InvalidToken as exc:
            raise ValueError("Invalid encrypted provider value.") from exc


def is_encrypted(value: str | None) -> bool:
    """Return True when the value looks encrypted."""

    return bool(value and value.startswith(ENC_PREFIX))
