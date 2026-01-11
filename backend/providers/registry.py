"""Provider registry for loading and updating provider configurations."""

from __future__ import annotations

import os
import re
import threading
from pathlib import Path
from typing import Any

import yaml

from backend.api.schemas import ModelConfig, ProviderConfig, ProviderUpdateRequest
from backend.config.settings import load_settings
from backend.providers.anthropic_provider import AnthropicProvider
from backend.providers.base import BaseProvider
from backend.providers.google_provider import GoogleProvider
from backend.providers.openai_provider import OpenAIProvider


ENV_PATTERN = re.compile(r"\$\{([^}]+)\}")


def _expand_env_value(value: str) -> str:
    """Expand environment variables in a string value."""

    def replace(match: re.Match[str]) -> str:
        env_value = os.getenv(match.group(1))
        return env_value if env_value is not None else match.group(0)

    return ENV_PATTERN.sub(replace, value)


def _expand_env(data: Any) -> Any:
    """Recursively expand environment variables inside nested data."""

    if isinstance(data, dict):
        return {key: _expand_env(value) for key, value in data.items()}
    if isinstance(data, list):
        return [_expand_env(value) for value in data]
    if isinstance(data, str):
        return _expand_env_value(data)
    return data


def _load_yaml(file_path: Path) -> dict[str, Any]:
    """Load YAML content from a file."""

    if not file_path.exists():
        raise FileNotFoundError(f"Provider config not found: {file_path}")
    content = file_path.read_text(encoding="utf-8")
    data = yaml.safe_load(content) or {}
    if not isinstance(data, dict):
        raise ValueError("Provider config root must be a mapping.")
    return data


def _save_yaml(file_path: Path, data: dict[str, Any]) -> None:
    """Persist YAML content to a file."""

    file_path.parent.mkdir(parents=True, exist_ok=True)
    content = yaml.safe_dump(data, sort_keys=False, allow_unicode=True)
    file_path.write_text(content, encoding="utf-8")


def _build_provider(config: ProviderConfig) -> BaseProvider | None:
    """Create a provider instance based on type."""

    provider_type = config.type.lower()
    if provider_type in {"openai", "ollama"}:
        return OpenAIProvider(config)
    if provider_type == "anthropic":
        return AnthropicProvider(config)
    if provider_type == "google":
        return GoogleProvider(config)
    return None


class ProviderRegistry:
    """Registry for managing providers and their configurations."""

    def __init__(self, providers_file: Path) -> None:
        """Initialize the registry with a provider config file path."""

        self._providers_file = providers_file
        self._lock = threading.Lock()
        self._configs: dict[str, ProviderConfig] = {}
        self._providers: dict[str, BaseProvider] = {}
        self._model_index: dict[str, tuple[str, ModelConfig]] = {}

    def load(self) -> list[ProviderConfig]:
        """Load provider configs from disk and refresh instances."""

        with self._lock:
            data = _load_yaml(self._providers_file)
            providers_raw = data.get("providers", [])
            if not isinstance(providers_raw, list):
                raise ValueError("providers field must be a list.")
            expanded = _expand_env(providers_raw)
            self._configs = {
                item["id"]: ProviderConfig.model_validate(item) for item in expanded
            }
            self._providers = {}
            self._model_index = {}
            for provider_config in self._configs.values():
                provider_instance = _build_provider(provider_config)
                if provider_instance is not None:
                    self._providers[provider_config.id] = provider_instance
                for model_config in provider_config.models:
                    if model_config.id not in self._model_index:
                        self._model_index[model_config.id] = (provider_config.id, model_config)
            return list(self._configs.values())

    def list_configs(self) -> list[ProviderConfig]:
        """Return all provider configs."""

        with self._lock:
            return list(self._configs.values())

    def get_config(self, provider_id: str) -> ProviderConfig:
        """Return a provider config by id."""

        with self._lock:
            if provider_id not in self._configs:
                raise KeyError(f"Provider not found: {provider_id}")
            return self._configs[provider_id]

    def update_config(self, provider_id: str, update: ProviderUpdateRequest) -> ProviderConfig:
        """Update a provider configuration and persist to disk."""

        with self._lock:
            data = _load_yaml(self._providers_file)
            providers_raw = data.get("providers", [])
            if not isinstance(providers_raw, list):
                raise ValueError("providers field must be a list.")
            target = None
            for item in providers_raw:
                if item.get("id") == provider_id:
                    target = item
                    break
            if target is None:
                raise KeyError(f"Provider not found: {provider_id}")
            changes = update.model_dump(exclude_unset=True)
            if "name" in changes:
                target["name"] = changes["name"]
            if "api_key" in changes:
                target["api_key"] = changes["api_key"]
            if "base_url" in changes:
                target["base_url"] = changes["base_url"]
            _save_yaml(self._providers_file, data)
            self.load()
            return self.get_config(provider_id)

    def get_provider(self, provider_id: str) -> BaseProvider:
        """Return a provider instance by id."""

        with self._lock:
            if provider_id not in self._providers:
                raise KeyError(f"Provider instance not available: {provider_id}")
            return self._providers[provider_id]

    def resolve_model(self, model_id: str) -> tuple[ProviderConfig, ModelConfig, BaseProvider]:
        """Resolve a model id to its provider config, model config, and provider instance."""

        with self._lock:
            if model_id not in self._model_index:
                raise KeyError(f"Model not found: {model_id}")
            provider_id, model_config = self._model_index[model_id]
            provider_config = self._configs[provider_id]
            if provider_id not in self._providers:
                raise KeyError(f"Provider instance not available: {provider_id}")
            return provider_config, model_config, self._providers[provider_id]

    def update_model_prompt(
        self, provider_id: str, model_id: str, prompt: str | None
    ) -> ModelConfig:
        """Update the prompt for a specific model and persist to disk."""

        with self._lock:
            data = _load_yaml(self._providers_file)
            providers_raw = data.get("providers", [])
            if not isinstance(providers_raw, list):
                raise ValueError("providers field must be a list.")
            provider_item = None
            for item in providers_raw:
                if item.get("id") == provider_id:
                    provider_item = item
                    break
            if provider_item is None:
                raise KeyError(f"Provider not found: {provider_id}")
            models_raw = provider_item.get("models", [])
            if not isinstance(models_raw, list):
                raise ValueError("models field must be a list.")
            model_item = None
            for item in models_raw:
                if item.get("id") == model_id:
                    model_item = item
                    break
            if model_item is None:
                raise KeyError(f"Model not found: {model_id}")
            model_item["prompt"] = prompt
            _save_yaml(self._providers_file, data)
            self.load()
            updated_config = self.get_config(provider_id)
            for model_config in updated_config.models:
                if model_config.id == model_id:
                    return model_config
            raise KeyError(f"Model not found after update: {model_id}")

    def add_provider(self, config: ProviderConfig) -> ProviderConfig:
        """Add a new provider to the configuration."""

        with self._lock:
            if config.id in self._configs:
                raise ValueError(f"Provider ID already exists: {config.id}")

            data = _load_yaml(self._providers_file)
            providers_raw = data.get("providers", [])
            if not isinstance(providers_raw, list):
                providers_raw = []
                data["providers"] = providers_raw
            
            # Serialize headers
            provider_dict = config.model_dump(exclude_unset=True)
            providers_raw.append(provider_dict)
            
            _save_yaml(self._providers_file, data)
            self.load()
            return self.get_config(config.id)

    def add_model(self, provider_id: str, model_config: ModelConfig) -> ModelConfig:
        """Add a new model to a provider."""

        with self._lock:
            if provider_id not in self._configs:
                raise KeyError(f"Provider not found: {provider_id}")
            
            # Check for duplicate model ID across ALL providers to (optionally) prevent confusion,
            # but usually model IDs must be unique globally or scoped. 
            # Current logic indexes by model_id in self._model_index.
            if model_config.id in self._model_index:
                # If model ID exists, check if it's the same provider (duplicate) or different (conflict)
                existing_pid, _ = self._model_index[model_config.id]
                raise ValueError(f"Model ID '{model_config.id}' already exists in provider '{existing_pid}'")

            data = _load_yaml(self._providers_file)
            providers_raw = data.get("providers", [])
            target_provider = None
            for item in providers_raw:
                if item.get("id") == provider_id:
                    target_provider = item
                    break
            
            if target_provider is None:
                 raise KeyError(f"Provider not found in YAML: {provider_id}")

            models_list = target_provider.get("models", [])
            if not isinstance(models_list, list):
                models_list = []
                target_provider["models"] = models_list

            # Check for duplicate in YAML explicitly
            for m in models_list:
                if m.get("id") == model_config.id:
                     raise ValueError(f"Model ID already exists in this provider: {model_config.id}")

            models_list.append(model_config.model_dump(exclude_unset=True))
            _save_yaml(self._providers_file, data)
            self.load()
            
            # Verify addition
            provider_config = self.get_config(provider_id)
            for m in provider_config.models:
                if m.id == model_config.id:
                    return m
            raise RuntimeError("Failed to add model.")


_registry_instance: ProviderRegistry | None = None


def get_provider_registry() -> ProviderRegistry:
    """Return the singleton provider registry."""

    global _registry_instance
    if _registry_instance is None:
        settings = load_settings()
        _registry_instance = ProviderRegistry(settings.providers_file)
    return _registry_instance
