from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any


class BaseProvider(ABC):
    """Single responsibility: call an LLM and return the raw text response."""

    @abstractmethod
    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
    ) -> str: ...


class OpenAICompatibleProvider(BaseProvider):
    """
    Works with any OpenAI-compatible endpoint.
    Covers: OpenAI, Groq, Together.ai, Ollama, vLLM, LM Studio, Jan.ai, Perplexity, etc.
    Set base_url to the provider's endpoint; leave api_key empty for local models.
    """

    def __init__(self, base_url: str, api_key: str, model: str) -> None:
        from openai import OpenAI
        # OpenAI client requires non-empty api_key even for local models
        self._client = OpenAI(base_url=base_url, api_key=api_key or "local")
        self._model = model

    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
    ) -> str:
        kwargs: dict[str, Any] = dict(
            model=self._model,
            messages=messages,
            temperature=temperature,
        )
        if response_format:
            kwargs["response_format"] = response_format
        resp = self._client.chat.completions.create(**kwargs)
        return resp.choices[0].message.content or ""


class AnthropicProvider(BaseProvider):
    """Anthropic Claude via the official SDK (different request/response format)."""

    def __init__(self, api_key: str, model: str = "claude-3-5-haiku-20241022") -> None:
        import anthropic
        self._client = anthropic.Anthropic(api_key=api_key)
        self._model = model

    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
    ) -> str:
        resp = self._client.messages.create(
            model=self._model,
            max_tokens=2048,
            temperature=temperature,
            messages=messages,
        )
        return resp.content[0].text


class MockProvider(BaseProvider):
    """Offline fallback — platform must work with no API key set."""

    _RESPONSES: dict[str, str] = {
        "generate_question": json.dumps({
            "question_text": "Explain the difference between a stack and a queue, and give a real-world use case for each.",
            "difficulty": "EASY",
            "category": "Data Structures",
        }),
        "evaluate_turn": json.dumps({
            "technical_score": 6.5,
            "communication_score": 7.0,
            "wpm": 130,
            "filler_words": 3,
            "feedback": "Good understanding. Try to use more concrete examples.",
            "strengths": "Clear structure and logical flow.",
            "weaknesses": "Could elaborate more on edge cases.",
            "next_recommended_difficulty": "MEDIUM",
        }),
        "evaluate_listening": json.dumps({
            "score": 7.0,
            "accuracy_level": "MEDIUM",
            "feedback": "You captured the main idea but missed some supporting details.",
            "missed_key_points": ["The timeline mentioned in the story", "The secondary character's role"],
        }),
    }

    def chat_complete(
        self,
        messages: list[dict[str, str]],
        response_format: dict[str, str] | None = None,
        temperature: float = 0.7,
    ) -> str:
        content = messages[-1].get("content", "").lower()
        if "interview question" in content or "generate" in content:
            return self._RESPONSES["generate_question"]
        if "listening" in content:
            return self._RESPONSES["evaluate_listening"]
        return self._RESPONSES["evaluate_turn"]
