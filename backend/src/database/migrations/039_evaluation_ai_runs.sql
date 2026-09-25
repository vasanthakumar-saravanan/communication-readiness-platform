-- M2: ai_runs table
-- Actual schema is richer than checklist — adds capability, provider, prompt_version,
-- input_hash, request_metadata, response_metadata, token_usage, error_code, error_message.
-- Always write a record here for every LLM call, even on failure.

CREATE TABLE evaluation.ai_runs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    response_id       UUID REFERENCES evaluation.responses(id),
    capability        VARCHAR(50) NOT NULL DEFAULT 'EVALUATE_RESPONSE',
    provider          VARCHAR(50),
    model             VARCHAR(100),
    prompt_version    VARCHAR(20),
    input_hash        VARCHAR(64),
    request_metadata  JSONB,
    response_metadata JSONB,
    status            VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                          CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
    latency_ms        INTEGER,
    token_usage       JSONB,
    error_code        VARCHAR(50),
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ
);
