from __future__ import annotations

from typing import Any
from pydantic import BaseModel, Field, model_validator


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
    resume_context: str | None = None  # backwards-compatible extra context

class GeneratedQuestionResponse(BaseModel):
    question_text: str
    difficulty: str
    category: str | None = None
    # 3-5 short points a strong answer should cover — the rubric the answer is scored against
    key_points: list[str] = Field(default_factory=list)


# ── Turn Evaluation ────────────────────────────────────────────────────────────

class TurnEvaluationRequest(BaseModel):
    question_text: str
    student_answer: str
    difficulty: str
    turn_number: int = 1
    domain: str | None = None
    # Rubric from question generation; when present the answer is checked point by point
    expected_points: list[str] = Field(default_factory=list)


class TurnEvaluationResponse(BaseModel):
    technical_score: float = Field(ge=0, le=10)
    communication_score: float = Field(ge=0, le=10)
    wpm: int = Field(ge=0)
    filler_words: int = Field(ge=0)
    feedback: str
    strengths: str
    weaknesses: str
    next_recommended_difficulty: str
    fluency_score: float | None = Field(default=None, ge=0, le=10)
    clarity_score: float | None = Field(default=None, ge=0, le=10)
    is_clarification: bool = False
    clarification_response: str = ""
    points_covered: list[str] = Field(default_factory=list)
    points_missed: list[str] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def _clamp_scores(cls, data: Any) -> Any:
        if isinstance(data, dict):
            for key in ("technical_score", "communication_score", "fluency_score", "clarity_score"):
                value = data.get(key)
                if isinstance(value, (int, float)):
                    data[key] = min(10.0, max(0.0, float(value)))
            for key in ("wpm", "filler_words"):
                value = data.get(key)
                if isinstance(value, (int, float)):
                    data[key] = max(0, int(value))
        return data



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


# ── Evaluate Response Text (SSE streaming endpoint) ────────────────────────────

class RecentTurnItem(BaseModel):
    turn: int
    question: str
    answer: str
    difficulty: str = "EASY"


class EvaluateResponseTextMetadata(BaseModel):
    question_text: str
    difficulty: str = "EASY"
    turn_number: int = 1
    session_id: str = ""
    student_id: str = ""
    domain: str | None = None
    interview_state: dict[str, Any] = Field(default_factory=dict)
    short_term_context: list[str] = Field(default_factory=list)
    recent_turns: list[RecentTurnItem] = Field(default_factory=list)
    current_rubric: dict[str, Any] = Field(default_factory=dict)
    resume: dict[str, Any] = Field(default_factory=dict)


class EvaluateResponseTextRequest(BaseModel):
    transcript: str
    metadata: EvaluateResponseTextMetadata


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
