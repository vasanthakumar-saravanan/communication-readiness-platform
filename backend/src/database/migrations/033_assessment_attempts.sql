-- M2: assessment_attempts table
-- Conflict note: checklist has credit_cost column; actual schema stores credit_policy_snapshot JSONB.
-- Following actual schema. org.students does not have program_id (only batch_id);
-- program_id snapshot is derived at attempt creation time via batches.program_id.

CREATE TABLE assessment.assessment_attempts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id           UUID NOT NULL REFERENCES assessment.assessments(id),
    student_id              UUID NOT NULL REFERENCES org.students(id),
    interview_type          VARCHAR(50),
    conducted_event_key     VARCHAR(100),

    -- Immutable org snapshot at time of attempt
    program_id              UUID NOT NULL REFERENCES org.programs(id),
    batch_id                UUID NOT NULL REFERENCES org.batches(id),
    subdivision_id          UUID REFERENCES org.subdivisions(id),

    assessment_version      INTEGER,
    scoring_version         VARCHAR(20),
    configuration_snapshot  JSONB,
    credit_policy_snapshot  JSONB,

    status                  VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS'
                                CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'ABANDONED')),
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at            TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
