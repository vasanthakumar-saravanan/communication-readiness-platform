CREATE TABLE org.programs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  institution_id  UUID NOT NULL REFERENCES org.institutions(id) ON DELETE RESTRICT,
  name            VARCHAR(255) NOT NULL,
  code            VARCHAR(50) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (institution_id, code)
);
