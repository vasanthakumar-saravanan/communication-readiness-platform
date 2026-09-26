-- M1: interview_transcripts table
-- Raw audio turn records for the audio-path interview flow.
-- session_id FK deferred to migration 116 (assessment_sessions created in 034, which runs later).
-- response_id FK deferred to migration 116 (evaluation.responses created in 038, which runs later).
-- Both are stored as plain UUIDs until migration 116 adds the constraints.

CREATE TABLE session.interview_transcripts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id      UUID NOT NULL,
    student_id      UUID NOT NULL REFERENCES org.students(id),
    turn_number     INTEGER NOT NULL,
    transcript_text TEXT,
    audio_url       TEXT,
    duration_sec    INTEGER,
    response_id     UUID,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_transcripts_session_turn UNIQUE (session_id, turn_number)
);

CREATE INDEX idx_transcripts_session_id ON session.interview_transcripts (session_id);
CREATE INDEX idx_transcripts_student_id ON session.interview_transcripts (student_id);
