-- Shared FKs: adds deferred constraints on session.interview_transcripts (migration 016).
-- Both referenced tables are created in M2 migrations (034, 038) which run after 016.

ALTER TABLE session.interview_transcripts
    ADD CONSTRAINT fk_transcripts_session
    FOREIGN KEY (session_id) REFERENCES session.assessment_sessions(id) ON DELETE CASCADE;

ALTER TABLE session.interview_transcripts
    ADD CONSTRAINT fk_transcripts_response
    FOREIGN KEY (response_id) REFERENCES evaluation.responses(id) ON DELETE SET NULL;
