-- M4: credit account — one row per student, maintains denormalized balance
-- balance CHECK >= 0 enforces the credit floor (no negative balances).
-- student_id FK to org.students deferred to migration 115 (cross-schema).

CREATE TABLE credit.credit_accounts (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL UNIQUE,
    balance    NUMERIC(10,2) NOT NULL DEFAULT 0
                   CHECK (balance >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
