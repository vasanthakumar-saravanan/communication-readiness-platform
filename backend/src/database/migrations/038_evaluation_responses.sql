-- M2: responses table
-- Conflict note: checklist has session_id + transcript + duration_sec + mode.
-- Actual schema has attempt_id + input_type + text_answer + transcript + idempotency_key.
-- Following actual schema. duration_sec stored in text_answer metadata or omitted for MVP.

CREATE TABLE evaluation.responses (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id       UUID NOT NULL REFERENCES assessment.assessment_attempts(id),
    question_id      UUID NOT NULL REFERENCES session.questions(id),
    input_type       VARCHAR(10) NOT NULL DEFAULT 'TEXT'
                         CHECK (input_type IN ('VOICE', 'TEXT', 'MIXED')),
    text_answer      TEXT,
    transcript       TEXT,
    idempotency_key  VARCHAR(100) NOT NULL,
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_responses_idempotency   UNIQUE (idempotency_key),
    CONSTRAINT uq_responses_attempt_question UNIQUE (attempt_id, question_id)
);
