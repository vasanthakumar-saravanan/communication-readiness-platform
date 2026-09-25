-- M2: response_evaluations table
-- Conflict note: checklist has individual score columns (fluency_score, pace_wpm, filler_count, etc.).
-- Actual schema uses communication_metrics JSONB for raw metrics and dimension_scores JSONB
-- for per-response breakdown. Following actual schema.

CREATE TABLE evaluation.response_evaluations (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id          UUID NOT NULL UNIQUE REFERENCES evaluation.responses(id),
    ai_run_id            UUID NOT NULL REFERENCES evaluation.ai_runs(id),
    technical_score      NUMERIC(5,2),
    communication_score  NUMERIC(5,2),
    listening_score      NUMERIC(5,2),
    confidence           NUMERIC(5,2),
    strengths            JSONB,
    weaknesses           JSONB,
    feedback             TEXT,
    dimension_scores     JSONB,
    communication_metrics JSONB,
    listening_metrics    JSONB,
    evaluation_version   VARCHAR(20) NOT NULL DEFAULT '1.0',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
