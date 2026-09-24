from __future__ import annotations

import json
import os
from typing import Any

from app.services.providers import BaseProvider, MockProvider, OpenAICompatibleProvider

# ── Provider presets ───────────────────────────────────────────────────────────
# LLM_BASE_URL overrides these. Add any OpenAI-compatible endpoint here.

PROVIDER_PRESETS: dict[str, str] = {
    "groq":       "https://api.groq.com/openai/v1",
    "openai":     "https://api.openai.com/v1",
    "together":   "https://api.together.xyz/v1",
    "perplexity": "https://api.perplexity.ai",
    "ollama":     "http://localhost:11434/v1",
    "lmstudio":   "http://localhost:1234/v1",
    "vllm":       "http://localhost:8000/v1",
}

DEFAULT_MODELS: dict[str, str] = {
    "groq":       "llama-3.3-70b-versatile",
    "openai":     "gpt-4o-mini",
    "together":   "meta-llama/Llama-3-70b-chat-hf",
    "perplexity": "llama-3.1-sonar-small-128k-online",
    "ollama":     "llama3.3",
    "lmstudio":   "local-model",
    "vllm":       "local-model",
}

# Providers that work without an API key
_LOCAL_PROVIDERS = {"ollama", "lmstudio", "vllm"}


def _build_provider() -> BaseProvider:
    provider_name = os.getenv("LLM_PROVIDER", "groq").lower()

    if provider_name == "mock":
        return MockProvider()

    if provider_name == "anthropic":
        from app.services.providers import AnthropicProvider
        api_key = os.getenv("LLM_API_KEY") or os.getenv("ANTHROPIC_API_KEY", "")
        model = os.getenv("LLM_MODEL") or "claude-3-5-haiku-20241022"
        return AnthropicProvider(api_key=api_key, model=model) if api_key else MockProvider()

    # All others (groq, openai, together, ollama, lmstudio, vllm, custom) share the
    # OpenAI-compatible interface. LLM_BASE_URL takes priority over preset.
    base_url = os.getenv("LLM_BASE_URL") or PROVIDER_PRESETS.get(provider_name, "")
    api_key = os.getenv("LLM_API_KEY") or os.getenv("GROQ_API_KEY", "")
    model = os.getenv("LLM_MODEL") or DEFAULT_MODELS.get(provider_name, "")

    if not base_url:
        return MockProvider()  # unrecognised provider name → safe offline fallback

    if not api_key and provider_name not in _LOCAL_PROVIDERS:
        return MockProvider()  # cloud provider with no key → offline fallback

    return OpenAICompatibleProvider(base_url=base_url, api_key=api_key, model=model)


# ── High-level client ─────────────────────────────────────────────────────────

class LLMClient:
    """
    Task-specific interface consumed by routers.
    All actual LLM I/O is delegated to the injected BaseProvider.
    Prompt building, JSON parsing, and validation live here — not in routers.
    """

    def __init__(self, provider: BaseProvider) -> None:
        self._provider = provider

    @property
    def provider_name(self) -> str:
        return type(self._provider).__name__

    def _call_json(self, prompt: str) -> dict[str, Any]:
        raw = self._provider.chat_complete(
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
        )
        return json.loads(raw)

    def generate_question(self, prompt: str) -> dict[str, Any]:
        return self._call_json(prompt)

    def evaluate_turn(self, prompt: str) -> dict[str, Any]:
        return self._call_json(prompt)

    def evaluate_listening(self, prompt: str) -> dict[str, Any]:
        return self._call_json(prompt)


# ── Singleton ─────────────────────────────────────────────────────────────────

_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    global _client
    if _client is None:
        _client = LLMClient(_build_provider())
    return _client


def update_llm_config(
    provider: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    model: str | None = None,
) -> str:
    """Rebuild the singleton at runtime — called by POST /ai/config."""
    global _client
    if provider is not None:
        os.environ["LLM_PROVIDER"] = provider
    if base_url is not None:
        os.environ["LLM_BASE_URL"] = base_url
    if api_key is not None:
        os.environ["LLM_API_KEY"] = api_key
        os.environ["GROQ_API_KEY"] = api_key  # backward compat
    if model is not None:
        os.environ["LLM_MODEL"] = model
    _client = LLMClient(_build_provider())
    return _client.provider_name


# Backward-compat shim for any code that imported update_groq_config
def update_groq_config(
    api_key: str | None = None,
    model: str | None = None,
    provider: str | None = None,
) -> str:
    return update_llm_config(provider=provider, api_key=api_key, model=model)
