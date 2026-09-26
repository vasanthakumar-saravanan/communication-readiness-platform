-- M4: configurable credit economy rules
-- policy_key is an optional slug for seed/lookup convenience (e.g. 'GLOBAL_DEFAULT').
-- scope_type determines which rows apply: GLOBAL → all students; narrower scopes override.
-- institution_id, program_id, subdivision_id, student_id are optional scope filters
-- (no FK constraints so policies can be seeded before those rows exist).

CREATE TABLE credit.credit_policies (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_key               VARCHAR(100) UNIQUE,
    scope_type               VARCHAR(20) NOT NULL DEFAULT 'GLOBAL'
                                 CHECK (scope_type IN ('GLOBAL', 'PROGRAM', 'SUBDIVISION', 'STUDENT')),
    institution_id           UUID,
    program_id               UUID,
    subdivision_id           UUID,
    student_id               UUID,
    initial_credit_amount    NUMERIC(10,2) NOT NULL DEFAULT 50,
    consume_amount           NUMERIC(10,2) NOT NULL DEFAULT 10,
    reward_ceiling           NUMERIC(10,2) NOT NULL DEFAULT 200,
    max_balance              NUMERIC(10,2),
    self_practice_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
    conducted_attempt_policy JSONB,
    is_active                BOOLEAN NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
