import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { AuthUser, JWTPayload } from '../shared/types/auth';

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new AppError(401, 'Bearer token required', 'UNAUTHENTICATED');
    }
    const token = header.slice(7);

    let decoded: JWTPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    } catch (err) {
      const code = err instanceof jwt.TokenExpiredError ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID';
      throw new AppError(401, 'Invalid or expired token', code);
    }

    // DB check: token_version must match — catches revoked tokens after logout
    const { rows } = await db.query<{ token_version: number; status: string }>(
      'SELECT token_version, status FROM identity.users WHERE id = $1',
      [decoded.id]
    );
    if (rows.length === 0) {
      throw new AppError(401, 'User not found', 'USER_NOT_FOUND');
    }
    if (rows[0].status === 'SUSPENDED') {
      throw new AppError(403, 'Account suspended', 'ACCOUNT_SUSPENDED');
    }
    if (rows[0].token_version !== decoded.tokenVersion) {
      throw new AppError(401, 'Token has been revoked', 'TOKEN_REVOKED');
    }

    req.user = decoded;
    next();
  } catch (err) {
    if (err instanceof AppError) {
      res.status(err.statusCode).json({ status: 'error', message: err.message, code: err.code });
      return;
    }
    next(err);
  }
};
