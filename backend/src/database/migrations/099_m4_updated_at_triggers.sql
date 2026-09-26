-- M4: updated_at auto-update triggers for credit and placement tables
-- Reuses the trigger function created in migration 015 (M1).

CREATE TRIGGER trg_credit_accounts_updated_at
    BEFORE UPDATE ON credit.credit_accounts
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_credit_policies_updated_at
    BEFORE UPDATE ON credit.credit_policies
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_checklist_items_updated_at
    BEFORE UPDATE ON placement.checklist_items
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_checklist_progress_updated_at
    BEFORE UPDATE ON placement.checklist_progress
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_mentor_verifications_updated_at
    BEFORE UPDATE ON placement.mentor_verifications
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_placement_eligibility_updated_at
    BEFORE UPDATE ON placement.placement_eligibility
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
