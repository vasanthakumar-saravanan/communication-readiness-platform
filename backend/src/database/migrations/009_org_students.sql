CREATE TABLE org.students (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID UNIQUE NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  roll_number      VARCHAR(50) UNIQUE NOT NULL,
  batch_id         UUID NOT NULL REFERENCES org.batches(id) ON DELETE RESTRICT,
  subdivision_id   UUID REFERENCES org.subdivisions(id) ON DELETE SET NULL,
  coding_handles   JSONB NOT NULL DEFAULT '{}',
  resume_url       TEXT,
  resume_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
