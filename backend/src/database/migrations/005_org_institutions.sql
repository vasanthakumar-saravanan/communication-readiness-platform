CREATE TABLE org.institutions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        VARCHAR(255) NOT NULL,
  code        VARCHAR(50) UNIQUE NOT NULL,
  type        VARCHAR(50),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
