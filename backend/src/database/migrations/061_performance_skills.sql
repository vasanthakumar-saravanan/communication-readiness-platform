-- M3: skills taxonomy (owned by M3; M2 references via question_bank_item_skills)
-- Cross-schema FK from session.question_bank_item_skills.skill_id is deferred to migration 115.
-- Schema source of truth uses 'category' (not 'domain' as in M3 checklist).

CREATE TABLE performance.skills (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    category    VARCHAR(50)  NOT NULL
                    CHECK (category IN ('TECHNICAL', 'COMMUNICATION', 'BEHAVIORAL', 'DOMAIN_SPECIFIC')),
    description TEXT,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_skills_category_name UNIQUE (category, name)
);
