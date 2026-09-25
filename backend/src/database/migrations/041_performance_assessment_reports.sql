-- M2: assessment_reports table (M2 writes, M3 reads — do NOT modify schema without M3 coordination)
-- Conflict note: checklist has individual columns (total_questions, tab_switch_count, is_proctor_flagged).
-- Actual schema stores these in component_scores/skill_scores JSONB. Following actual schema.
-- Proctoring state (tab_switch_count, is_proctor_flagged) stored in component_scores JSONB.

CREATE TABLE performance.assessment_reports (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id              UUID NOT NULL UNIQUE REFERENCES assessment.assessment_attempts(id),
    student_id              UUID NOT NULL REFERENCES org.students(id),
    assessment_version      INTEGER,
    scoring_version         VARCHAR(20) NOT NULL DEFAULT '1.0',
    technical_score         NUMERIC(5,2),
    communication_score     NUMERIC(5,2),
    listening_score         NUMERIC(5,2),
    overall_score           NUMERIC(5,2),
    component_scores        JSONB,
    skill_scores            JSONB,
    strengths               JSONB,
    weaknesses              JSONB,
    feedback                TEXT,
    recommendations_snapshot JSONB,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
