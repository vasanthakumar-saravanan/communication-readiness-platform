-- M2: assessments table
-- Conflict note: checklist specifies configuration JSONB + created_by.
-- Actual database_schema has no configuration or created_by columns.
-- Following actual schema.

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE assessment.assessments (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name             VARCHAR(255) NOT NULL CHECK (length(trim(name)) > 0),
    assessment_type  VARCHAR(50)  NOT NULL CHECK (assessment_type IN ('MOCK_INTERVIEW', 'LISTENING_COMPREHENSION')),
    interview_type   VARCHAR(50),
    version          INTEGER NOT NULL DEFAULT 1,
    description      TEXT,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_assessments_version UNIQUE (id, version)
);
