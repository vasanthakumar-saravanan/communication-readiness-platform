from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field


# ── Question Generation ────────────────────────────────────────────────────────

class ProjectSummary(BaseModel):
    title: str
    tech_stack: list[str] = Field(default_factory=list)
    description: str = ""


class PreviousTurn(BaseModel):
    question_text: str
    student_answer: str
    difficulty: str
    technical_score: float | None = None
    feedback: str | None = None


class QuestionGenerationRequest(BaseModel):
    student_name: str
    skills: list[str] = Field(default_factory=list)
    projects: list[ProjectSummary] = Field(default_factory=list)
    previous_turns: list[PreviousTurn] = Field(default_factory=list)
    difficulty: str = "EASY"
    domain: str | None = None  # PEP domain, if applicable


class GeneratedQuestionResponse(BaseModel):
    question_text: str
    difficulty: str
    category: str | None = None


# ── Turn Evaluation ────────────────────────────────────────────────────────────

class TurnEvaluationRequest(BaseModel):
    question_text: str
    student_answer: str
    difficulty: str
    turn_number: int = 1
    domain: str | None = None


class TurnEvaluationResponse(BaseModel):
    technical_score: float = Field(ge=0, le=10)
    communication_score: float = Field(ge=0, le=10)
    wpm: int = Field(ge=0)
    filler_words: int = Field(ge=0)
    feedback: str
    strengths: str
    weaknesses: str
    next_recommended_difficulty: str  # EASY | MEDIUM | ADVANCED


# ── Listening Evaluation ───────────────────────────────────────────────────────

class ListeningEvaluationRequest(BaseModel):
    story_text: str
    question: str
    student_answer: str
    expected_answer: str


class ListeningEvaluationResponse(BaseModel):
    score: float = Field(ge=0, le=10)
    accuracy_level: str  # HIGH | MEDIUM | LOW
    feedback: str
    missed_key_points: list[str] = Field(default_factory=list)


# ── Config ─────────────────────────────────────────────────────────────────────

class ConfigUpdateRequest(BaseModel):
    groq_api_key: str | None = None
    groq_model: str | None = None
    llm_provider: str | None = None
    llm_base_url: str | None = None   # explicit endpoint URL (overrides preset)


class ConfigUpdateResponse(BaseModel):
    status: str
    active_provider: str
    details: dict[str, Any] = Field(default_factory=dict)
