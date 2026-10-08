-- org.drill_assignments  (Faculty/Trainer drill dispatch — scoped assignment records)
-- A FACULTY_MENTOR or PROGRAM_ADMIN dispatches a drill (mock interview or listening lab)
-- to a target scope. Scope enforcement happens at the API layer: the creator must hold
-- an active identity.role_assignment whose program_id/subdivision_id covers the target.

CREATE TABLE org.drill_assignments (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by      UUID         NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  creator_role    VARCHAR(50)  NOT NULL,

  title           VARCHAR(255) NOT NULL,
  session_type    VARCHAR(50)  NOT NULL CHECK (session_type IN ('MOCK_INTERVIEW','LISTENING_COMPREHENSION','BOTH')),

  -- Targeting scope (one of these will be populated depending on target_scope)
  target_scope    VARCHAR(50)  NOT NULL
                    CHECK (target_scope IN ('PROGRAM','SUBDIVISION','MY_MENTEES','SPECIFIC_STUDENT','ALL_STUDENTS')),
  program_id      UUID         REFERENCES org.programs(id)    ON DELETE SET NULL,
  subdivision_id  UUID         REFERENCES org.subdivisions(id) ON DELETE SET NULL,
  target_user_id  UUID         REFERENCES identity.users(id)  ON DELETE SET NULL,

  -- Interview configuration
  interview_mode  VARCHAR(20)  DEFAULT 'TOPIC',
  domain_or_topic VARCHAR(255),
  difficulty      VARCHAR(20)  DEFAULT 'MEDIUM',
  listening_passage_id VARCHAR(100),
  custom_instructions TEXT,

  -- Schedule
  due_date        DATE         NOT NULL,
  start_time      TIME,
  end_time        TIME,
  is_mandatory    BOOLEAN      NOT NULL DEFAULT true,

  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_drill_assignments_creator    ON org.drill_assignments (created_by);
CREATE INDEX idx_drill_assignments_program    ON org.drill_assignments (program_id);
CREATE INDEX idx_drill_assignments_subdiv     ON org.drill_assignments (subdivision_id);
CREATE INDEX idx_drill_assignments_active     ON org.drill_assignments (created_by, is_active);
