-- No FK to identity.users — log survives user deletion
CREATE TABLE system.audit_logs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL,
  action         VARCHAR(100) NOT NULL,
  resource_type  VARCHAR(50),
  resource_id    UUID,
  metadata       JSONB,
  ip_address     INET,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
