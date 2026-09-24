import { UserRole } from './index';

// ── Scope ──────────────────────────────────────────────────────────────────────

export type AccessScopeType =
  | 'INSTITUTION'
  | 'PROGRAM'
  | 'DOMAIN'
  | 'BATCH'
  | 'DEPARTMENT'
  | 'EXPLICIT_STUDENT';

export interface AccessScope {
  type: AccessScopeType;
  id: string;
}

// ── Permissions ────────────────────────────────────────────────────────────────

export interface Permission {
  id: string;
  resource: string;   // 'assessment' | 'student' | 'report' | 'credit' | 'user' …
  action: string;     // 'read' | 'create' | 'evaluate' | 'manage' | 'verify' …
  scopes: AccessScopeType[];
}

export interface RoleDefinition {
  role: UserRole;
  permissions: Permission[];
}

// ── Assignment ─────────────────────────────────────────────────────────────────

export interface RoleAssignment {
  userId: string;
  role: UserRole;
  scope: AccessScope;
  grantedAt: string;
  expiresAt?: string;
}

// ── User ───────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  roleAssignments: RoleAssignment[];
  passwordHash: string;
  isActive: boolean;
}

// ── Token ──────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  sub: string;      // user id
  email: string;
  name: string;
  role: UserRole;
  jti?: string;     // token id — reserved for future revocation
  type: 'access' | 'refresh';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;  // seconds until access token expires
}
