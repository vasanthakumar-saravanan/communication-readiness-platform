import { Response, NextFunction } from 'express';
import { AuthRequest } from './authenticate';
import { UserRole } from '../shared/types/roles';
import { AppError } from '../shared/errors/AppError';

export const requireRole = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      const err = new AppError(401, 'Authentication required', 'UNAUTHENTICATED');
      res.status(401).json({ status: 'error', message: err.message, code: err.code });
      return;
    }
    if (!roles.includes(req.user.role)) {
      const err = new AppError(403, `Requires one of: ${roles.join(', ')}`, 'FORBIDDEN');
      res.status(403).json({ status: 'error', message: err.message, code: err.code });
      return;
    }
    next();
  };
};

// Guard: STUDENT accessing own data, or any staff role
export const requireStudentSelfOrStaff = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const user = req.user!;
  const staffRoles: UserRole[] = ['FACULTY_MENTOR', 'PROGRAM_ADMIN', 'TRAINER', 'PLACEMENT_COORDINATOR'];

  if (staffRoles.includes(user.role)) { next(); return; }

  // Student passes through — controller verifies student.user_id === req.user.id
  if (user.role === 'STUDENT') { next(); return; }

  const err = new AppError(403, 'Access denied', 'FORBIDDEN');
  res.status(403).json({ status: 'error', message: err.message, code: err.code });
};
