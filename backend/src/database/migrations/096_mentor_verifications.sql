-- M4: mentor sign-off records for student checklist items and profile reviews
-- student_id and mentor_user_id FKs deferred to migration 115 (cross-schema).
-- checklist_progress_id FK is within-schema (exists from migration 095).

CREATE TABLE placement.mentor_verifications (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id            UUID NOT NULL,
    mentor_user_id        UUID NOT NULL,
    verification_type     VARCHAR(20) NOT NULL DEFAULT 'CHECKLIST'
                              CHECK (verification_type IN ('PROFILE', 'CHECKLIST')),
    checklist_progress_id UUID REFERENCES placement.checklist_progress(id) ON DELETE SET NULL,
    status                VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                              CHECK (status IN ('VERIFIED', 'REJECTED', 'PENDING')),
    notes                 TEXT,
    verified_at           TIMESTAMPTZ,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
