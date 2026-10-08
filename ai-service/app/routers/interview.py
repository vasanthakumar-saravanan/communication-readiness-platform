from __future__ import annotations

import asyncio
import json
import re

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.models.schemas import (
    ConfigUpdateRequest,
    ConfigUpdateResponse,
    EvaluateResponseTextMetadata,
    EvaluateResponseTextRequest,
    GeneratedQuestionResponse,
    ListeningEvaluationRequest,
    ListeningEvaluationResponse,
    QuestionGenerationRequest,
    RecentTurnItem,
    TurnEvaluationRequest,
    TurnEvaluationResponse,
)
from app.config import settings
from app.services.llm_client import get_llm_client, update_llm_config

router = APIRouter(prefix="/ai", tags=["interview"])


def _skills_summary(req: QuestionGenerationRequest) -> str:
    skills = ", ".join(req.skills) if req.skills else "general programming"
    projects = "; ".join(
        f"{p.title} ({', '.join(p.tech_stack)})" for p in req.projects
    ) if req.projects else "no projects listed"
    history = ""
    if req.previous_turns:
        lines = [
            f"Q{i+1} [{t.difficulty}]: {t.question_text} → score {t.technical_score}"
            for i, t in enumerate(req.previous_turns)
        ]
        history = "\nPrevious turns:\n" + "\n".join(lines)
    return (
        f"Student: {req.student_name}\n"
        f"Skills: {skills}\n"
        f"Projects: {projects}\n"
        f"Target difficulty: {req.difficulty}"
        + (f"\nDomain: {req.domain}" if req.domain else "")
        + history
    )


# Scoring anchors used in prompts
_SCORING_ANCHORS = """
STRICT SCORING RULES — YOU MUST FOLLOW THESE EXACTLY:

answer_quality classification (choose ONE):
  NO_ANSWER  → "I don't know", "no idea", blank-equivalent, pure filler with no content
  WEAK       → severely incomplete, mostly wrong, mentions topic but adds nothing correct
  PARTIAL    → has some correct elements but misses key aspects
  GOOD       → correct and reasonably complete for the difficulty level
  EXCELLENT  → correct, complete, demonstrates depth beyond the question

technical_score (0.0–10.0) MUST map to answer_quality:
  NO_ANSWER  → 0.0–1.0   (non-negotiable — do NOT give credit for speaking)
  WEAK       → 1.0–3.0
  PARTIAL    → 3.0–6.0
  GOOD       → 6.0–8.0
  EXCELLENT  → 8.0–10.0

RUBRIC DIMENSIONS (each 0–100) — score ALL five independently:
  correctness          → factual accuracy of the answer
  relevance            → does it directly address the question asked
  completeness         → how thorough/complete the answer is
  technical_understanding → demonstrates correct conceptual understanding
  communication        → clarity, coherence, articulation

DIMENSION RANGES per answer_quality:
  NO_ANSWER  → all dimensions 0–5   (no technical content = no score)
  WEAK       → correctness 0–20, others 0–25
  PARTIAL    → correctness 20–55, relevance 20–60, completeness 15–50
  GOOD       → correctness 55–80, relevance 60–85, completeness 50–75
  EXCELLENT  → correctness 80–100, relevance 80–100, completeness 70–100

FINAL SCORE is computed DETERMINISTICALLY by the server:
  score = correctness*0.35 + relevance*0.25 + completeness*0.20 + technical_understanding*0.10 + communication*0.10

CRITICAL: A fluent "I don't know" is still a NO_ANSWER. Do NOT award technical points
for speech confidence, articulation, or communication if there is no correct technical content.
"""


@router.post("/generate-question", response_model=GeneratedQuestionResponse)
def generate_question(req: QuestionGenerationRequest) -> GeneratedQuestionResponse:
    print(f"[interview] generate_question start difficulty={req.difficulty}", flush=True)

    # Build PERSONALIZED prompt with resume context
    # For EASY difficulty, DO NOT include resume context to avoid overly personalized/complex questions
    resume_section = ""
    if req.resume_context and req.difficulty != "EASY":
        resume_section = f"\n\nStudent Resume Context:\n{req.resume_context[:800]}"

    difficulty_instruction = ""
    forbidden_keywords = []

    if req.difficulty == "EASY":
        difficulty_instruction = (
            "\n\n*** CRITICAL RULE: DIFFICULTY = EASY ***\n"
            "This MUST be a textbook-style, fundamental definition question suitable for a complete beginner. "
            "Ask about ONE basic concept: variables, data types, loops, conditionals, functions, arrays, or basic OOP. "
            "\nDO NOT personalize based on resume. DO NOT ask about projects, data fetching, error handling, "
            "state management, libraries, frameworks, or how they built something. "
            "\nABSOLUTELY FORBIDDEN TOPICS: Kafka, RabbitMQ, microservices, distributed systems, CI/CD, "
            "Kubernetes, Docker, load balancing, message queues, system design, architecture, deployment, "
            "API design, state management, async patterns, data fetching, error handling strategies, "
            "backend-frontend integration, REST APIs (beyond basic GET/POST), authentication, authorization. "
            "\nREQUIRED FORMAT: 'What is X?' or 'What is the difference between X and Y?' or 'Explain X'. "
            "\nPick from student's primary language: "
            + (f"{req.skills[0]}" if req.skills else "programming")
            + "\n\nEXAMPLES OF CORRECT EASY QUESTIONS:"
            "\n  - 'What is a variable in Java?'"
            "\n  - 'What is the difference between int and double?'"
            "\n  - 'Explain what an array is.'"
            "\n  - 'What does an if statement do?'"
            "\n  - 'What is a for loop used for?'"
            "\n  - 'What is the difference between a class and an object?'"
            "\n  - 'What is a function in programming?'"
            "\n  - 'What is the difference between = and == in Java?'"
            "\n\nEXAMPLES OF WRONG (TOO ADVANCED):"
            "\n  - 'Walk me through your data fetching strategy'"
            "\n  - 'How did you handle errors in your React app?'"
            "\n  - 'Explain your backend API design'"
            "\n  - ANY question mentioning a specific project or asking 'how you implemented X'"
        )
        # Keywords that should NEVER appear in EASY questions
        forbidden_keywords = [
            'kafka', 'rabbitmq', 'microservices', 'microservice', 'kubernetes', 'k8s',
            'distributed system', 'load balanc', 'message queue', 'event-driven',
            'ci/cd', 'pipeline', 'deployment', 'orchestration', 'docker compose',
            'backpressure', 'saga', 'cqrs', 'service mesh', 'api gateway',
            'scaling', 'sharding', 'replication', 'consistency', 'eventual',
            'architectural', 'architecture design', 'system design',
            # Project-specific / integration patterns
            'data fetch', 'error handling', 'state management', 'loading state',
            'api call', 'rest api', 'backend integration', 'frontend integration',
            'authentication', 'authorization', 'session', 'jwt', 'token',
            'async', 'promise', 'callback', 'event loop', 'closure',
            # Phrases that indicate project discussion
            'walk me through', 'how did you', 'in your project', 'your app',
            'you built', 'you handled', 'you implemented', 'you designed'
        ]
    elif req.difficulty == "MEDIUM":
        difficulty_instruction = (
            "\n\nDIFFICULTY = MEDIUM — Ask an intermediate question. "
            "The student should be able to answer based on practical usage experience. "
            "Test HOW they use a technology, not just what it is."
        )
    else:
        difficulty_instruction = (
            "\n\nDIFFICULTY = ADVANCED — Ask a deep or design-level question. "
            "Only use this if the student has already answered easier questions correctly."
        )

    prompt = (
        "You are a technical interviewer. Generate ONE interview question "
        "based on the student's resume and experience listed below.\n"
        + _skills_summary(req)
        + resume_section
        + difficulty_instruction
        + "\n\nRespond with valid JSON: {\"question_text\": str, \"difficulty\": str, \"category\": str}"
    )

    # Retry logic with validation for EASY difficulty
    max_retries = 3
    for attempt in range(max_retries):
        try:
            raw = get_llm_client().generate_question(prompt)
            question_text = raw.get('question_text', '')

            # Validate EASY questions don't contain forbidden keywords
            if req.difficulty == "EASY" and forbidden_keywords:
                question_lower = question_text.lower()
                found_forbidden = [kw for kw in forbidden_keywords if kw in question_lower]

                if found_forbidden:
                    print(f"[interview] FAIL: EASY question contains forbidden keywords: {found_forbidden}", flush=True)
                    print(f"[interview] Rejected question: {question_text}", flush=True)

                    if attempt < max_retries - 1:
                        # Retry with stricter prompt
                        print(f"[interview] Retrying... (attempt {attempt + 2}/{max_retries})", flush=True)
                        prompt = (
                            "You are a technical interviewer. Generate ONE BEGINNER-LEVEL interview question.\n"
                            "CRITICAL: This MUST be a basic, fundamental question suitable for a coding beginner.\n"
                            "Ask about: variables, data types, basic syntax, loops, conditionals, functions, arrays.\n"
                            f"Student knows: {', '.join(req.skills[:3]) if req.skills else 'programming'}\n"
                            f"\nABSOLUTELY FORBIDDEN: {', '.join(forbidden_keywords[:10])}\n"
                            "\nExamples of CORRECT questions:\n"
                            "- 'What is a variable in Java?'\n"
                            "- 'Explain the difference between int and double'\n"
                            "- 'What does an if statement do?'\n"
                            "- 'What is an array?'\n"
                            "\nRespond with valid JSON: {\"question_text\": str, \"difficulty\": \"EASY\", \"category\": str}"
                        )
                        continue
                    else:
                        # Fallback: use a hardcoded EASY question
                        print(f"[interview] WARNING: Max retries reached, using fallback EASY question", flush=True)
                        fallback_questions = [
                            ("What is a variable in programming and why do we use variables?", "Programming Fundamentals"),
                            ("Explain the difference between a while loop and a for loop.", "Programming Fundamentals"),
                            ("What is a function in programming and what are its benefits?", "Programming Fundamentals"),
                            ("What is the difference between int and float data types?", "Data Types"),
                            ("Explain what an array is and when you would use it.", "Data Structures"),
                        ]
                        # Pick based on student skills
                        question, category = fallback_questions[0]
                        if req.skills and 'java' in [s.lower() for s in req.skills]:
                            question = "What is a variable in Java and what are the different data types?"
                            category = "Java Basics"
                        elif req.skills and 'python' in [s.lower() for s in req.skills]:
                            question = "What is a variable in Python and how do you create one?"
                            category = "Python Basics"

                        return GeneratedQuestionResponse(
                            question_text=question,
                            difficulty="EASY",
                            category=category
                        )

            # Question is valid
            print(f"[interview] PASS: Question generated: {question_text[:100]}...", flush=True)
            return GeneratedQuestionResponse(**raw)

        except Exception as exc:
            if attempt < max_retries - 1:
                print(f"[interview] Error generating question (attempt {attempt + 1}/{max_retries}): {exc}", flush=True)
                continue
            raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc

    raise HTTPException(status_code=502, detail="Failed to generate valid question after retries")


@router.post("/evaluate-turn", response_model=TurnEvaluationResponse)
def evaluate_turn(req: TurnEvaluationRequest) -> TurnEvaluationResponse:
    print(f"[interview] evaluate_turn start turn={req.turn_number}", flush=True)
    prompt = (
        "You are an interview evaluator. Score the student's answer.\n"
        f"Question [{req.difficulty}]: {req.question_text}\n"
        f"Student answer: {req.student_answer}\n"
        f"Turn number: {req.turn_number}\n\n"
        "Respond with valid JSON: "
        "{\"technical_score\": 0-10, \"communication_score\": 0-10, "
        "\"wpm\": int, \"filler_words\": int, \"feedback\": str, "
        "\"strengths\": str, \"weaknesses\": str, "
        "\"next_recommended_difficulty\": \"EASY\"|\"MEDIUM\"|\"ADVANCED\"}"
    )
    try:
        raw = get_llm_client().evaluate_turn(prompt)
        return TurnEvaluationResponse(**raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc


@router.post("/evaluate-listening", response_model=ListeningEvaluationResponse)
def evaluate_listening(req: ListeningEvaluationRequest) -> ListeningEvaluationResponse:
    print(f"[interview] evaluate_listening start", flush=True)
    prompt = (
        "You are a listening comprehension evaluator.\n"
        f"Story: {req.story_text}\n"
        f"Question: {req.question}\n"
        f"Expected answer: {req.expected_answer}\n"
        f"Student answer: {req.student_answer}\n\n"
        "Respond with valid JSON: "
        "{\"score\": 0-10, \"accuracy_level\": \"HIGH\"|\"MEDIUM\"|\"LOW\", "
        "\"feedback\": str, \"missed_key_points\": [str]}"
    )
    try:
        raw = get_llm_client().evaluate_listening(prompt)
        return ListeningEvaluationResponse(**raw)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"LLM error: {exc}") from exc


def _sse(event: dict) -> str:
    return f"data: {json.dumps(event)}\n\n"


@router.post("/evaluate-response-text")
def evaluate_response_text(req: EvaluateResponseTextRequest):
    """
    SSE streaming endpoint for the WebSocket interview pipeline.
    Streams conversational_response word-by-word, then emits a result event
    with the full RawEvaluation JSON.
    """
    meta = req.metadata

    # ── Resume context ────────────────────────────────────────────────────────
    resume_section = ""
    if meta.resume:
        try:
            resume_section = f"\n\nStudent Resume:\n{json.dumps(meta.resume, indent=None)[:800]}"
        except Exception:
            pass

    # ── Full Q/A history for context ──────────────────────────────────────────
    history_section = ""
    if meta.recent_turns:
        lines = []
        for t in meta.recent_turns:
            lines.append(f"  Turn {t.turn} [{t.difficulty}]:")
            lines.append(f"    Q: {t.question}")
            lines.append(f"    A: {t.answer}")
        history_section = "\n\nPrevious Q&A history:\n" + "\n".join(lines)
    elif meta.short_term_context:
        history_section = "\n\nRecent context:\n" + "\n".join(
            f"- {s}" for s in meta.short_term_context[-5:]
        )

    # ── Active topic & curriculum ─────────────────────────────────────────────
    topic_section = ""
    state = meta.interview_state
    if state:
        active_topic = state.get("active_topic", "")
        curriculum = state.get("topic_curriculum", [])
        completed = state.get("completed_topics", [])
        do_not_ask = state.get("do_not_ask_or_repeat", [])
        topic_q_count = state.get("active_topic_question_count", 0)
        max_q_per_topic = state.get("max_questions_per_topic", 4)

        if active_topic:
            topic_section += f"\n\nCurrent topic: {active_topic}"
        if curriculum:
            topic_section += f"\nTopic curriculum: {', '.join(curriculum)}"
        if completed:
            topic_section += f"\nCompleted topics: {', '.join(completed)}"
        if do_not_ask:
            topic_section += f"\nDo NOT repeat these questions/topics: {'; '.join(do_not_ask[:10])}"
        topic_section += f"\nQuestions on current topic so far: {topic_q_count}/{max_q_per_topic}"
        if topic_q_count >= max_q_per_topic - 1:
            topic_section += "\nIMPORTANT: This topic is nearly exhausted — consider moving to the next topic in the curriculum."

    # ── Rubric ─────────────────────────────────────────────────────────────────
    rubric_section = ""
    if meta.current_rubric:
        try:
            rubric_section = f"\n\nEvaluation rubric: {json.dumps(meta.current_rubric)[:300]}"
        except Exception:
            pass

    # ── Difficulty instruction ────────────────────────────────────────────────
    # Turn 1 forces EASY for the NEXT question. For all turns, the NEXT question
    # must respect the recommended difficulty (determined by score).
    if meta.turn_number == 1:
        diff_label = "EASY"
        diff_note = (
            "\n\nTURN 1 RULE: This is the very first question. "
            "Regardless of resume content, the NEXT question must be EASY and beginner-friendly. "
            "Test a fundamental concept, not architecture or advanced design."
        )
    else:
        diff_label = meta.difficulty
        diff_note = ""

    # Next-question difficulty constraint based on answer quality
    next_diff_rule = (
        "\n\nNEXT QUESTION DIFFICULTY RULE:\n"
        "  - If answer_quality is NO_ANSWER or WEAK  → next_recommended_difficulty = same or lower than current\n"
        "  - If answer_quality is PARTIAL             → next_recommended_difficulty = same difficulty\n"
        "  - If answer_quality is GOOD                → next_recommended_difficulty = one level up (EASY→MEDIUM, MEDIUM→ADVANCED)\n"
        "  - If answer_quality is EXCELLENT           → next_recommended_difficulty = one level up\n"
        "  - NEVER jump from EASY to ADVANCED in one step.\n"
        f"  - Current difficulty is {diff_label}. The next question MUST respect the rule above.\n"
        "  - If generating an EASY next question: FORBIDDEN TOPICS are Kafka, RabbitMQ, microservices, Kubernetes, "
        "distributed systems, CI/CD, architecture, system design, deployment strategies, load balancing, message queues. "
        "REQUIRED for EASY: Ask about variables, data types, loops, functions, arrays, basic OOP, simple SQL, 'What is X' questions.\n"
    )

    prompt = (
        "You are an expert technical interviewer. "
        "Your job is to ACCURATELY evaluate the student's answer and generate an appropriate next question.\n\n"
        f"Domain: {meta.domain or 'General Technical'}\n"
        f"Current difficulty: {diff_label}\n"
        f"Turn number: {meta.turn_number}\n"
        f"Question asked: {meta.question_text}\n"
        f"Student answer: {req.transcript}"
        + resume_section
        + history_section
        + topic_section
        + rubric_section
        + diff_note
        + "\n\n"
        + _SCORING_ANCHORS
        + next_diff_rule
        + "\n\nAdditional rules:\n"
        "- next_question_text: MUST be completely different from every question in the history above\n"
        "- update_state.add_to_do_not_ask: ALWAYS set this to the EXACT current question text\n"
        "- update_state.mark_topic_completed: set ONLY if ≥ 4 questions on this topic were answered\n"
        "- is_clarification: true ONLY if the answer is clearly 'repeat the question'/'say that again'\n"
        "- feedback/strengths/weaknesses: must reflect actual answer quality — do NOT praise a NO_ANSWER\n"
        "\n\nRespond with ONLY valid JSON (no markdown, no commentary):\n"
        "{\n"
        '  "answer_quality": "NO_ANSWER"|"WEAK"|"PARTIAL"|"GOOD"|"EXCELLENT",\n'
        '  "technical_score": <0.0-10.0 float, strictly following answer_quality rules above>,\n'
        '  "filler_count": <int>,\n'
        '  "fluency_score": <0-100 int, reflects speech clarity only>,\n'
        '  "clarity_score": <0-100 int, reflects communication clarity only>,\n'
        '  "correctness": <0-100 int, factual accuracy — must obey dimension ranges above>,\n'
        '  "relevance": <0-100 int, addresses the question — must obey dimension ranges above>,\n'
        '  "completeness": <0-100 int, how thorough — must obey dimension ranges above>,\n'
        '  "technical_understanding": <0-100 int, conceptual depth — must obey dimension ranges above>,\n'
        '  "communication": <0-100 int, clarity/articulation — 0-5 for NO_ANSWER>,\n'
        '  "feedback": "<2-3 honest sentences — if NO_ANSWER, say so clearly>",\n'
        '  "strengths": "<genuine strengths or empty string if NO_ANSWER>",\n'
        '  "weaknesses": "<specific gaps or \'Did not provide an answer\' if NO_ANSWER>",\n'
        '  "next_recommended_difficulty": "EASY"|"MEDIUM"|"ADVANCED",\n'
        '  "pace_wpm": <int>,\n'
        '  "conversational_response": "<2-3 sentence natural interviewer follow-up>",\n'
        '  "next_question_text": "<next question, respects difficulty rule, not a repeat>",\n'
        '  "rubric_for_next_question": {"focus": "<topic>", "criteria": "<what to assess>"},\n'
        '  "update_state": {"mark_topic_completed": null, "add_to_do_not_ask": "<current question text verbatim>"},\n'
        '  "context_summary": "<one sentence summary of this Q&A>",\n'
        '  "is_clarification": false\n'
        "}"
    )

    def stream():
        # Call LLM (non-streaming; we fake-stream conversational_response afterward)
        try:
            raw = get_llm_client()._call_json(prompt, max_tokens=1024)
        except Exception as exc:
            yield _sse({"type": "error", "message": f"LLM error: {exc}"})
            return

        # Stream conversational_response word-by-word for a natural typing effect
        conv_response: str = raw.get("conversational_response", "")
        if conv_response:
            words = conv_response.split(" ")
            for i, word in enumerate(words):
                chunk = ("" if i == 0 else " ") + word
                yield _sse({"type": "text_chunk", "text": chunk})
        yield _sse({"type": "text_end"})

        # Determine answer_quality for validation
        answer_quality = str(raw.get("answer_quality", "")).upper()
        valid_qualities = {"NO_ANSWER", "WEAK", "PARTIAL", "GOOD", "EXCELLENT"}
        if answer_quality not in valid_qualities:
            answer_quality = "PARTIAL"  # safe default — never assume NO_ANSWER or EXCELLENT

        # technical_score MUST be consistent with answer_quality — clamp if LLM drifts
        raw_tech = float(raw.get("technical_score", 0.0))
        max_scores = {"NO_ANSWER": 1.0, "WEAK": 3.0, "PARTIAL": 6.5, "GOOD": 8.5, "EXCELLENT": 10.0}
        min_scores = {"NO_ANSWER": 0.0, "WEAK": 0.5, "PARTIAL": 2.5, "GOOD": 5.5, "EXCELLENT": 7.5}
        clamped_tech = max(min_scores[answer_quality], min(max_scores[answer_quality], raw_tech))

        # ── Validate and fix next_question if it's EASY but contains forbidden keywords ──
        next_question = str(raw.get("next_question_text", ""))
        next_diff = str(raw.get("next_recommended_difficulty", meta.difficulty))

        # For EASY next questions, validate no forbidden keywords
        if next_diff == "EASY" and next_question:
            forbidden_kws = [
                'kafka', 'rabbitmq', 'microservices', 'microservice', 'kubernetes',
                'distributed system', 'load balanc', 'message queue', 'ci/cd',
                'backpressure', 'architecture design', 'system design', 'deployment',
                'orchestration', 'api gateway', 'service mesh', 'saga', 'cqrs',
                'data fetch', 'error handling', 'state management', 'loading state',
                'api call', 'rest api', 'walk me through', 'how did you',
                'you built', 'you handled', 'your project', 'your app'
            ]
            next_q_lower = next_question.lower()
            found_forbidden = [kw for kw in forbidden_kws if kw in next_q_lower]

            if found_forbidden:
                # LLM violated EASY constraint — replace with fallback
                print(f"WARNING: EASY next question contains forbidden keywords: {found_forbidden}", flush=True)
                print(f"WARNING: Rejected: {next_question}", flush=True)

                # Fallback based on domain/topic
                fallbacks = [
                    "What is a variable in programming and how do you use it?",
                    "Explain the difference between a for loop and a while loop.",
                    "What is a function and why is it useful?",
                    "What is the difference between int and float data types?",
                    "Explain what an array is and give an example.",
                ]
                next_question = fallbacks[meta.turn_number % len(fallbacks)]
                print(f"PASS: Using fallback: {next_question}", flush=True)

        # ── Rubric dimensions (clamp per answer_quality) ──────────────────────
        _na = answer_quality == "NO_ANSWER"
        _wk = answer_quality == "WEAK"
        correctness = float(raw.get("correctness", 0.0 if _na else 50.0))
        relevance = float(raw.get("relevance", 0.0 if _na else 50.0))
        completeness = float(raw.get("completeness", 0.0 if _na else 50.0))
        technical_understanding = float(raw.get("technical_understanding", 0.0 if _na else 50.0))
        communication_score_raw = float(raw.get("communication", float(raw.get("clarity_score", 50.0))))

        if _na:
            correctness = min(correctness, 5.0)
            relevance = min(relevance, 5.0)
            completeness = min(completeness, 5.0)
            technical_understanding = min(technical_understanding, 5.0)
            communication_score_raw = min(communication_score_raw, 15.0)
        elif _wk:
            correctness = min(correctness, 20.0)
            relevance = min(relevance, 25.0)
            completeness = min(completeness, 25.0)
            technical_understanding = min(technical_understanding, 25.0)

        # Deterministic rubric score (server-side formula, LLM cannot override)
        rubric_score = (
            correctness * 0.35
            + relevance * 0.25
            + completeness * 0.20
            + technical_understanding * 0.10
            + communication_score_raw * 0.10
        )

        # clarity/fluency defaults: 50 (not 70) so missing fields don't inflate scores
        # Emit full evaluation result (use validated next_question instead of raw)
        result = {
            "answer_quality": answer_quality,
            "technical_score": round(correctness / 10.0, 2),  # map rubric correctness → 0-10 scale
            "filler_count": int(raw.get("filler_count", 0)),
            "fluency_score": float(raw.get("fluency_score", 50.0)),
            "clarity_score": float(raw.get("clarity_score", 50.0)),
            "correctness": correctness,
            "relevance": relevance,
            "completeness": completeness,
            "technical_understanding": technical_understanding,
            "communication": communication_score_raw,
            "rubric_score": round(rubric_score, 1),
            "feedback": str(raw.get("feedback", "")),
            "strengths": str(raw.get("strengths", "")),
            "weaknesses": str(raw.get("weaknesses", "")),
            "next_recommended_difficulty": next_diff,
            "transcript": req.transcript,
            "stt_raw": req.transcript,
            "pace_wpm": int(raw.get("pace_wpm", 120)),
            "conversational_response": conv_response,
            "next_question_text": next_question,  # Use validated question
            "rubric_for_next_question": raw.get("rubric_for_next_question", {}),
            "update_state": raw.get("update_state", {"mark_topic_completed": None, "add_to_do_not_ask": None}),
            "context_summary": str(raw.get("context_summary", "")),
            "is_clarification": bool(raw.get("is_clarification", False)),
        }
        yield _sse({"type": "result", "data": result})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/config", response_model=ConfigUpdateResponse)
def update_config(
    req: ConfigUpdateRequest,
    x_internal_key: str | None = Header(default=None),
) -> ConfigUpdateResponse:
    # Guard: require the shared secret so arbitrary callers cannot replace the LLM key.
    if x_internal_key != settings.internal_api_key:
        raise HTTPException(status_code=403, detail="Missing or invalid X-Internal-Key")
    active = update_llm_config(
        provider=req.llm_provider,
        base_url=req.llm_base_url,
        api_key=req.groq_api_key,
        model=req.groq_model,
    )
    return ConfigUpdateResponse(status="updated", active_provider=active)
