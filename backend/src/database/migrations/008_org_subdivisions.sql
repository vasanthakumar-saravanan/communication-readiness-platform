CREATE TABLE org.subdivisions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id    UUID NOT NULL REFERENCES org.batches(id) ON DELETE RESTRICT,
  name        VARCHAR(100) NOT NULL,
  type        VARCHAR(50),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
