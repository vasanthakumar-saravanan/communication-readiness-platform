-- M3: per-skill performance records (time-series, one row per student+skill+attempt)
-- Append-only history; queries compute averages at read time.
-- student_id and attempt_id FKs to cross-schema tables deferred to migration 115.
-- skill_id FK is within-schema (performance.skills) — added directly.

CREATE TABLE performance.skill_performances (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id        UUID NOT NULL,
    skill_id          UUID NOT NULL REFERENCES performance.skills(id) ON DELETE RESTRICT,
    attempt_id        UUID,
    score             NUMERIC(5,2) NOT NULL DEFAULT 0,
    proficiency_level VARCHAR(30),
    source            VARCHAR(50),
    measured_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
