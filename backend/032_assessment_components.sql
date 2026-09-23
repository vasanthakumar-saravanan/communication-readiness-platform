CREATE TABLE assessment.assessment_components (
    id UUID PRIMARY KEY,

    assessment_id UUID NOT NULL,

    name VARCHAR(100) NOT NULL
        CHECK (length(trim(name)) > 0),

    weight DECIMAL(5,2) NOT NULL
        CHECK (weight > 0 AND weight <= 1.00), 

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_assessment_components_assessment
        FOREIGN KEY (assessment_id)
        REFERENCES assessment.assessments(id)
        ON DELETE CASCADE
);