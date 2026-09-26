-- M4: placement readiness checklist items (coordinator-managed)
-- program_id and subdivision_id FKs deferred to migration 115 (cross-schema).
-- is_required=TRUE items must all be mentor-verified for placement eligibility.

CREATE TABLE placement.checklist_items (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id     UUID NOT NULL,
    subdivision_id UUID,
    name           VARCHAR(255) NOT NULL,
    description    TEXT,
    category       VARCHAR(100),
    max_score      NUMERIC(5,2),
    weight         NUMERIC(5,4),
    is_required    BOOLEAN NOT NULL DEFAULT TRUE,
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_checklist_items_program_name UNIQUE (program_id, name)
);
