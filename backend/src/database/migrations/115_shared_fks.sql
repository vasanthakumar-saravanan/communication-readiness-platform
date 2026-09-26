-- Shared FK migration: cross-schema foreign key constraints deferred from individual module migrations.
-- Run AFTER all module migrations (001–109) have been applied.
-- All referenced tables must exist before this migration runs.

-- ─── M3: performance schema ────────────────────────────────────────────────

ALTER TABLE performance.performance_profiles
    ADD CONSTRAINT fk_profiles_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE CASCADE;

ALTER TABLE performance.performance_snapshots
    ADD CONSTRAINT fk_snapshots_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE CASCADE;

ALTER TABLE performance.performance_snapshots
    ADD CONSTRAINT fk_snapshots_attempt
    FOREIGN KEY (attempt_id) REFERENCES assessment.assessment_attempts(id) ON DELETE RESTRICT;

ALTER TABLE performance.skill_performances
    ADD CONSTRAINT fk_skill_perf_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE CASCADE;

ALTER TABLE performance.skill_performances
    ADD CONSTRAINT fk_skill_perf_attempt
    FOREIGN KEY (attempt_id) REFERENCES assessment.assessment_attempts(id) ON DELETE SET NULL;

-- ─── Deferred M2 FKs (tables existed before M3 ran) ───────────────────────

-- session.question_bank_item_skills.skill_id — FK omitted in migration 036;
-- performance.skills (M3) didn't exist yet when M2 migrations ran.
ALTER TABLE session.question_bank_item_skills
    ADD CONSTRAINT fk_qbis_skill
    FOREIGN KEY (skill_id) REFERENCES performance.skills(id) ON DELETE RESTRICT;

-- session.questions.listening_story_id — FK omitted in migration 037;
-- performance.listening_stories (M3) didn't exist yet when M2 migrations ran.
ALTER TABLE session.questions
    ADD CONSTRAINT fk_questions_listening_story
    FOREIGN KEY (listening_story_id) REFERENCES performance.listening_stories(id) ON DELETE SET NULL;

-- session.questions.primary_skill_id — FK omitted in migration 037;
-- performance.skills (M3) didn't exist yet when M2 migrations ran.
ALTER TABLE session.questions
    ADD CONSTRAINT fk_questions_primary_skill
    FOREIGN KEY (primary_skill_id) REFERENCES performance.skills(id) ON DELETE SET NULL;

-- ─── M4: credit schema ─────────────────────────────────────────────────────

ALTER TABLE credit.credit_accounts
    ADD CONSTRAINT fk_credit_accounts_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE RESTRICT;

ALTER TABLE credit.credit_transactions
    ADD CONSTRAINT fk_credit_txn_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE RESTRICT;

-- ─── M4: placement schema ──────────────────────────────────────────────────

ALTER TABLE placement.checklist_items
    ADD CONSTRAINT fk_checklist_items_program
    FOREIGN KEY (program_id) REFERENCES org.programs(id) ON DELETE RESTRICT;

ALTER TABLE placement.checklist_items
    ADD CONSTRAINT fk_checklist_items_subdivision
    FOREIGN KEY (subdivision_id) REFERENCES org.subdivisions(id) ON DELETE SET NULL;

ALTER TABLE placement.checklist_progress
    ADD CONSTRAINT fk_checklist_progress_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE CASCADE;

ALTER TABLE placement.mentor_verifications
    ADD CONSTRAINT fk_mentor_verif_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE CASCADE;

ALTER TABLE placement.mentor_verifications
    ADD CONSTRAINT fk_mentor_verif_mentor_user
    FOREIGN KEY (mentor_user_id) REFERENCES identity.users(id) ON DELETE RESTRICT;

ALTER TABLE placement.placement_eligibility
    ADD CONSTRAINT fk_placement_elig_student
    FOREIGN KEY (student_id) REFERENCES org.students(id) ON DELETE CASCADE;
