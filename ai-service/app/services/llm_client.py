from __future__ import annotations

import json
import os
from typing import Any

from app.services.providers import BaseProvider, MockProvider, OpenAICompatibleProvider

# ── Provider presets ───────────────────────────────────────────────────────────

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
    "groq":       "qwen/qwen3.8-27b",
    "openai":     "gpt-4o-mini",
    "together":   "meta-llama/Llama-3-70b-chat-hf",
    "perplexity": "llama-3.1-sonar-small-128k-online",
    "ollama":     "llama3.3",
    "lmstudio":   "local-model",
    "vllm":       "local-model",
}

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

    base_url = os.getenv("LLM_BASE_URL") or PROVIDER_PRESETS.get(provider_name, "")
    # Check both generic and provider-specific key vars, then fall back to pydantic settings
    api_key = os.getenv("LLM_API_KEY") or os.getenv("GROQ_API_KEY", "")
    if not api_key:
        from app.config import settings
        api_key = settings.groq_api_key or settings.llm_api_key
    model = os.getenv("LLM_MODEL") or os.getenv("GROQ_MODEL", "") or DEFAULT_MODELS.get(provider_name, "")

    if not base_url:
        return MockProvider()

    if not api_key and provider_name not in _LOCAL_PROVIDERS:
        return MockProvider()

    return OpenAICompatibleProvider(base_url=base_url, api_key=api_key, model=model)


# ── High-level client ─────────────────────────────────────────────────────────

class LLMClient:
    """
    Task-specific interface consumed by routers.
    All actual LLM I/O is delegated to the injected BaseProvider.
    """

    def __init__(self, provider: BaseProvider) -> None:
        self._provider = provider

    @property
    def provider_name(self) -> str:
        return type(self._provider).__name__

    def _call_json(self, prompt: str, max_tokens: int | None = None) -> dict[str, Any]:
        raw = self._provider.chat_complete(
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            max_tokens=max_tokens,
        )
        return json.loads(raw)

    def generate_question(self, prompt: str) -> dict[str, Any]:
        return self._call_json(prompt)

    def evaluate_turn(self, prompt: str) -> dict[str, Any]:
        return self._call_json(prompt)

    def evaluate_listening(self, prompt: str) -> dict[str, Any]:
        return self._call_json(prompt)

    def chat_complete_with_tools(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Run one agent-loop step: return next action (tool_call or final_answer)."""
        return self._provider.chat_complete_with_tools(messages, tools)


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
    """Rebuild the singleton at runtime — called by POST /ai/config.

    MULTI-WORKER LIMITATION: This function mutates os.environ and the module-level
    _client singleton in the current process only. Under a multi-worker Uvicorn
    deployment (--workers N, N > 1) each worker has its own copy of os.environ and
    _client, so POST /ai/config updates only the worker that handles the request.
    Run with --workers 1 for reliable config updates.
    """
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


# Backward-compat shim
def update_groq_config(
    api_key: str | None = None,
    model: str | None = None,
    provider: str | None = None,
) -> str:
    return update_llm_config(provider=provider, api_key=api_key, model=model)
