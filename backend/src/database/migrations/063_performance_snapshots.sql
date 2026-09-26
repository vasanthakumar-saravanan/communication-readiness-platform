-- M3: immutable performance snapshot — one row per completed assessment attempt
-- Append-only: never UPDATE or DELETE a snapshot.
-- student_id and attempt_id FKs deferred to migration 115 (cross-schema).
-- program_id, batch_id, subdivision_id are denormalized org snapshot at capture time.

CREATE TABLE performance.performance_snapshots (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL,
    attempt_id          UUID NOT NULL UNIQUE,
    program_id          UUID NOT NULL,
    batch_id            UUID NOT NULL,
    subdivision_id      UUID,
    technical_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
    communication_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    listening_score     NUMERIC(5,2) NOT NULL DEFAULT 0,
    overall_score       NUMERIC(5,2) NOT NULL DEFAULT 0,
    component_scores    JSONB,
    skill_scores        JSONB,
    captured_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
