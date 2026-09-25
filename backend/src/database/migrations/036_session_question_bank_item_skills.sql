-- M2: question_bank_item_skills junction table
-- Cross-schema FK to performance.skills (M3 owned) is intentionally OMITTED here.
-- It will be added in a shared FK migration (115+) once M3 delivers performance.skills.
-- skill_id is stored as UUID without a FK constraint until then.

CREATE TABLE session.question_bank_item_skills (
    question_bank_item_id   UUID NOT NULL REFERENCES session.question_bank_items(id) ON DELETE CASCADE,
    skill_id                UUID NOT NULL,
    is_primary              BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (question_bank_item_id, skill_id)
);
