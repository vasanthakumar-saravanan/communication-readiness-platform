CREATE TABLE org.student_mentor_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id   UUID NOT NULL REFERENCES org.students(id) ON DELETE CASCADE,
  mentor_id    UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
  assigned_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_by  UUID NOT NULL REFERENCES identity.users(id),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);

-- Only one active assignment per student at a time
CREATE UNIQUE INDEX uq_active_student_mentor
  ON org.student_mentor_assignments (student_id)
  WHERE is_active = TRUE;
