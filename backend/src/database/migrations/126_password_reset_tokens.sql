-- Password reset tokens for secure forgot-password flow.
-- Tokens are hashed before storage (never stored raw in database).
-- Each token expires after a short period and can only be used once.

CREATE TABLE IF NOT EXISTS identity.password_reset_tokens (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID         NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
  token_hash  TEXT         NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  request_ip  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id    ON identity.password_reset_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON identity.password_reset_tokens (expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON identity.password_reset_tokens (token_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_created_at ON identity.password_reset_tokens (created_at);
