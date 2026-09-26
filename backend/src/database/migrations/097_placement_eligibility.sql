-- M4: computed placement eligibility per student (upserted after each qualifying event)
-- student_id FK deferred to migration 115 (cross-schema).
-- blocking_reasons stores which mandatory checklist items or score thresholds block eligibility.

CREATE TABLE placement.placement_eligibility (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID NOT NULL UNIQUE,
    total_score      NUMERIC(7,2),
    maximum_score    NUMERIC(7,2),
    threshold_score  NUMERIC(7,2),
    is_eligible      BOOLEAN NOT NULL DEFAULT FALSE,
    blocking_reasons JSONB,
    reason           TEXT,
    evaluated_at     TIMESTAMPTZ,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
