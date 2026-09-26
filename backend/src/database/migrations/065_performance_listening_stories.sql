-- M3: listening story content for listening comprehension sessions (M2 reads this table)
-- Following database_schema section 17 (uses 'content', 'source_type', 'metadata').
-- M3 checklist used different column names (content_text, audio_storage_path, etc.)
-- but the database schema is source of truth.

CREATE TABLE performance.listening_stories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title       VARCHAR(255) NOT NULL,
    content     TEXT,
    difficulty  VARCHAR(10) NOT NULL
                    CHECK (difficulty IN ('EASY', 'MEDIUM', 'ADVANCED')),
    source_type VARCHAR(50),
    metadata    JSONB,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
