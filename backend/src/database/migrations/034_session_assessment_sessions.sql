-- M2: assessment_sessions table
-- Conflict note: checklist specifies individual proctoring columns (tab_switch_count,
-- fullscreen_exit_count, is_proctor_flagged, replay_count, session_type).
-- Actual schema uses a single state_data JSONB for all runtime state.
-- Proctoring state is stored in state_data: { tab_switch_count, fullscreen_exit_count,
-- is_proctor_flagged, replay_count, session_type }.

CREATE TABLE session.assessment_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attempt_id          UUID NOT NULL UNIQUE REFERENCES assessment.assessment_attempts(id),
    current_sequence_no INTEGER NOT NULL DEFAULT 0,
    state               VARCHAR(20) NOT NULL DEFAULT 'INITIALIZED'
                            CHECK (state IN ('INITIALIZED', 'ACTIVE', 'PAUSED', 'COMPLETED', 'TERMINATED')),
    state_data          JSONB NOT NULL DEFAULT '{}',
    last_activity_at    TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
