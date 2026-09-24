CREATE TYPE org.student_track AS ENUM (
  'HOPE_ELITE',
  'HOPE_NON_ELITE',
  'PEP',
  'DEPARTMENT'
);

CREATE TABLE org.batches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id  UUID NOT NULL REFERENCES org.programs(id) ON DELETE RESTRICT,
  name        VARCHAR(100) NOT NULL,
  year        INTEGER NOT NULL,
  track       org.student_track NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
