-- M3: chunked knowledge content with pgvector embeddings for RAG retrieval
-- Reuses the 'vector' extension registered in migration 031 (M2).
-- embedding dimension: 1536 (OpenAI/Groq text-embedding-3-small compatible).
-- IVFFlat index is created in migration 068 (separate to allow tuning after data load).

CREATE TABLE knowledge.knowledge_chunks (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id       UUID NOT NULL REFERENCES knowledge.knowledge_documents(id) ON DELETE CASCADE,
    chunk_index       INTEGER NOT NULL,
    chunk_text        TEXT,
    embedding         vector(1536),
    embedding_model   VARCHAR(100),
    embedding_version INTEGER,
    source_metadata   JSONB,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_chunks_document_idx UNIQUE (document_id, chunk_index)
);
