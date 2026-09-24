import { UserRole } from './roles';

export interface AuthUser {
  id: string;            // identity.users.id (UUID)
  email: string;
  role: UserRole;
  name: string;
  tokenVersion: number;  // compared to DB on every request — revocation mechanism
}

export interface JWTPayload extends AuthUser {
  iat: number;
  exp: number;
}
