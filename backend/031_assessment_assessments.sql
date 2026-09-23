CREATE SCHEMA IF NOT EXISTS assessment;

CREATE TABLE assessment.assessments (
    id UUID PRIMARY KEY,

    title VARCHAR(255) NOT NULL
        CHECK (length(trim(title)) > 0),

    type VARCHAR(50) NOT NULL
        CHECK (type IN ('MOCK_INTERVIEW', 'LISTENING_COMPREHENSION')),

    description ,TEXT

    configuration JSONB,

    is_active BOOLEAN DEFAULT TRUE,

    created_by UUID NOT NULL, 

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_assessments_created_by
        FOREIGN KEY (created_by)
        REFERENCES identity.users(id)
);