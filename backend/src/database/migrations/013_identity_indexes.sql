CREATE INDEX idx_users_email       ON identity.users (email);
CREATE INDEX idx_users_role        ON identity.users (role);
CREATE INDEX idx_users_status      ON identity.users (status);
CREATE INDEX idx_audit_logs_user_id ON system.audit_logs (user_id);
CREATE INDEX idx_audit_logs_action  ON system.audit_logs (action);
