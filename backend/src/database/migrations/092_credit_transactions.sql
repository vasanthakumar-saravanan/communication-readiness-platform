-- M4: immutable credit ledger — append-only, never UPDATE or DELETE
-- account_id FK is within-schema (credit_accounts exists from migration 091).
-- student_id FK to org.students deferred to migration 115 (cross-schema).
-- idempotency_key prevents duplicate credit operations on retry.

CREATE TABLE credit.credit_transactions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id       UUID NOT NULL REFERENCES credit.credit_accounts(id) ON DELETE RESTRICT,
    student_id       UUID NOT NULL,
    transaction_type VARCHAR(20) NOT NULL
                         CHECK (transaction_type IN ('EARN', 'CONSUME', 'ADJUST', 'REFUND', 'INITIAL')),
    amount           NUMERIC(10,2) NOT NULL,
    balance_after    NUMERIC(10,2) NOT NULL,
    idempotency_key  VARCHAR(100) NOT NULL,
    reference_type   VARCHAR(50),
    reference_id     UUID,
    metadata         JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_credit_txn_idempotency UNIQUE (idempotency_key)
);
