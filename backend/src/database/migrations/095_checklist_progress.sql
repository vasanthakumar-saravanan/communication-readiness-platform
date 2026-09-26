-- M4: student completion progress per checklist item
-- student_id FK deferred to migration 115 (cross-schema).
-- checklist_item_id FK is within-schema (exists from migration 094).
-- is_mentor_verified tracks whether the faculty mentor has signed off.

CREATE TABLE placement.checklist_progress (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL,
    checklist_item_id   UUID NOT NULL REFERENCES placement.checklist_items(id) ON DELETE RESTRICT,
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED')),
    score               NUMERIC(5,2),
    max_score           NUMERIC(5,2),
    completion_evidence TEXT,
    is_mentor_verified  BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at        TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_checklist_progress_student_item UNIQUE (student_id, checklist_item_id)
);
