-- M4: indexes for credit and placement schemas

-- credit.credit_accounts
CREATE INDEX idx_credit_accounts_student ON credit.credit_accounts (student_id);

-- credit.credit_transactions
CREATE INDEX idx_credit_txn_account_id   ON credit.credit_transactions (account_id);
CREATE INDEX idx_credit_txn_student_at   ON credit.credit_transactions (student_id, created_at DESC);

-- credit.credit_policies
CREATE INDEX idx_credit_policies_scope   ON credit.credit_policies (scope_type) WHERE is_active = TRUE;

-- placement.checklist_items
CREATE INDEX idx_checklist_items_program ON placement.checklist_items (program_id, subdivision_id);

-- placement.checklist_progress
CREATE INDEX idx_checklist_prog_student  ON placement.checklist_progress (student_id, status);
CREATE INDEX idx_checklist_prog_item     ON placement.checklist_progress (checklist_item_id);

-- placement.mentor_verifications
CREATE INDEX idx_mentor_verif_student    ON placement.mentor_verifications (student_id, verification_type);
CREATE INDEX idx_mentor_verif_mentor     ON placement.mentor_verifications (mentor_user_id, student_id);
CREATE INDEX idx_mentor_verif_progress   ON placement.mentor_verifications (checklist_progress_id);

-- placement.placement_eligibility
CREATE INDEX idx_placement_elig_student  ON placement.placement_eligibility (student_id);
