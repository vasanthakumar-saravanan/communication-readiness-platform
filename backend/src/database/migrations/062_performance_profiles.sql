-- M3: performance profile — one mutable row per student (running averages)
-- student_id FK to org.students deferred to migration 115 (cross-schema).
-- assessment_count and last_assessment_at are operational additions required by
-- the ATTEMPT_COMPLETED handler to compute incremental running averages.

CREATE TABLE performance.performance_profiles (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id             UUID NOT NULL UNIQUE,
    technical_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
    communication_score    NUMERIC(5,2) NOT NULL DEFAULT 0,
    listening_score        NUMERIC(5,2) NOT NULL DEFAULT 0,
    overall_score          NUMERIC(5,2) NOT NULL DEFAULT 0,
    previous_overall_score NUMERIC(5,2),
    trend                  VARCHAR(20) CHECK (trend IN ('IMPROVING', 'STABLE', 'DECLINING')),
    assessment_count       INTEGER NOT NULL DEFAULT 0,
    last_assessment_at     TIMESTAMPTZ,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
