-- M3: updated_at auto-update triggers for mutable performance/knowledge tables
-- Reuses the trigger function created in migration 015 (M1).

CREATE TRIGGER trg_skills_updated_at
    BEFORE UPDATE ON performance.skills
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_performance_profiles_updated_at
    BEFORE UPDATE ON performance.performance_profiles
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_listening_stories_updated_at
    BEFORE UPDATE ON performance.listening_stories
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_knowledge_documents_updated_at
    BEFORE UPDATE ON knowledge.knowledge_documents
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
