-- M2: question_bank_items table
-- Includes pgvector embedding column (extension created in 031).
-- Conflict note: checklist has expected_answer_hint TEXT; actual schema uses evaluation_criteria JSONB.
-- Following actual schema.

CREATE TABLE session.question_bank_items (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_text       TEXT NOT NULL CHECK (length(trim(question_text)) > 0),
    difficulty          VARCHAR(10) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'ADVANCED')),
    evaluation_criteria JSONB,
    metadata            JSONB,
    embedding           vector(1536),
    embedding_model     VARCHAR(100),
    embedding_version   INTEGER,
    content_hash        VARCHAR(64),
    embedded_at         TIMESTAMPTZ,
    is_generated        BOOLEAN NOT NULL DEFAULT FALSE,
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
