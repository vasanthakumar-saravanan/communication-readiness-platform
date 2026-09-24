CREATE TABLE org.trainer_subdivision_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trainer_id      UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  subdivision_id  UUID NOT NULL REFERENCES org.subdivisions(id) ON DELETE CASCADE,
  start_date      DATE NOT NULL,
  end_date        DATE,
  assigned_by     UUID NOT NULL REFERENCES identity.users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
