-- M3: indexes for performance and knowledge schemas

-- performance.skills
CREATE INDEX idx_skills_category_active ON performance.skills (category) WHERE is_active = TRUE;

-- performance.performance_profiles
CREATE INDEX idx_profiles_student_id ON performance.performance_profiles (student_id);

-- performance.performance_snapshots
CREATE INDEX idx_snapshots_student_captured ON performance.performance_snapshots (student_id, captured_at DESC);
CREATE INDEX idx_snapshots_attempt_id       ON performance.performance_snapshots (attempt_id);
CREATE INDEX idx_snapshots_program_batch    ON performance.performance_snapshots (program_id, batch_id, subdivision_id);

-- performance.skill_performances
CREATE INDEX idx_skill_perf_student_skill ON performance.skill_performances (student_id, skill_id, measured_at DESC);
CREATE INDEX idx_skill_perf_skill_at      ON performance.skill_performances (skill_id, measured_at DESC);

-- performance.listening_stories
CREATE INDEX idx_listening_stories_active ON performance.listening_stories (difficulty) WHERE is_active = TRUE;

-- knowledge.knowledge_chunks — IVFFlat approximate nearest-neighbour for cosine similarity
-- lists=100 is appropriate for up to ~1M chunks; tune after initial data load.
CREATE INDEX idx_knowledge_chunks_embedding
    ON knowledge.knowledge_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
