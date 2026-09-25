-- M2: questions table
-- Conflict note: checklist links questions to session_id; actual schema links to attempt_id.
-- Following actual schema (attempt_id).
-- FK to performance.listening_stories (M3) and performance.skills (M3) are stored as
-- plain UUID columns without FK constraints until M3 delivers those tables.

CREATE TABLE session.questions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id            UUID NOT NULL REFERENCES assessment.assessment_attempts(id),
    question_bank_item_id UUID REFERENCES session.question_bank_items(id),
    listening_story_id    UUID,
    question_type         VARCHAR(30) NOT NULL DEFAULT 'INTERVIEW'
                              CHECK (question_type IN ('INTERVIEW', 'LISTENING', 'GENERAL')),
    sequence_no           INTEGER NOT NULL,
    question_text         TEXT NOT NULL CHECK (length(trim(question_text)) > 0),
    difficulty            VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'ADVANCED')),
    primary_skill_id      UUID,
    evaluation_criteria   JSONB,
    question_version      INTEGER NOT NULL DEFAULT 1,
    is_generated          BOOLEAN NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_questions_attempt_seq UNIQUE (attempt_id, sequence_no),
    CONSTRAINT uq_questions_attempt_id  UNIQUE (attempt_id, id)
);
