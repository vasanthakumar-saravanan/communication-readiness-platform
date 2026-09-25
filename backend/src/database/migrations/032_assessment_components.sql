-- M2: assessment_components table
-- Conflict note: checklist says weight must sum to 1.00 per assessment — enforced in application.
-- Actual schema adds component_type + configuration JSONB + is_active (not in checklist).

CREATE TABLE assessment.assessment_components (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id    UUID NOT NULL REFERENCES assessment.assessments(id) ON DELETE CASCADE,
    component_type   VARCHAR(50) NOT NULL,
    name             VARCHAR(100) NOT NULL CHECK (length(trim(name)) > 0),
    weight           NUMERIC(5,2) NOT NULL CHECK (weight > 0 AND weight <= 1.00),
    configuration    JSONB,
    is_active        BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_assessment_components_type UNIQUE (assessment_id, component_type)
);
