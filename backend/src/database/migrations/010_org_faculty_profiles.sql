CREATE TABLE org.faculty_profiles (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID UNIQUE NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  department   VARCHAR(100),
  designation  VARCHAR(100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
