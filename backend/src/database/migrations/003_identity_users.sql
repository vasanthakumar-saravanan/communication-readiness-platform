CREATE TYPE identity.user_role AS ENUM (
  'STUDENT',
  'FACULTY_MENTOR',
  'PROGRAM_ADMIN',
  'TRAINER',
  'PLACEMENT_COORDINATOR'
);

CREATE TYPE identity.user_status AS ENUM (
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED'
);

CREATE TABLE identity.users (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           VARCHAR(255) NOT NULL,
  email          VARCHAR(255) UNIQUE NOT NULL CHECK (email = lower(email)),
  password_hash  VARCHAR(255) NOT NULL,
  role           identity.user_role NOT NULL,
  token_version  INTEGER NOT NULL DEFAULT 0,
  status         identity.user_status NOT NULL DEFAULT 'ACTIVE',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
