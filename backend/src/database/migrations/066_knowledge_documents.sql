-- M3: knowledge base document metadata (RAG source documents)
-- Following database_schema section 19.
-- institution_id, program_id, subdivision_id are optional scope references (no FK constraints
-- since this module may be deployed before those rows exist; scoping is best-effort).

CREATE TABLE knowledge.knowledge_documents (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(255) NOT NULL,
    source_type     VARCHAR(50),
    source_url      VARCHAR(500),
    visibility_type VARCHAR(50),
    institution_id  UUID,
    program_id      UUID,
    subdivision_id  UUID,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
