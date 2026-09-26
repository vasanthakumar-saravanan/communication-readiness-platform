import { Router, Response } from 'express';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { EligibilityService } from './eligibility.service';

export const placementRouter = Router();

// GET /api/placement-eligibility/report — must be registered BEFORE /:studentId to avoid shadowing
placementRouter.get(
  '/report',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR', 'PROGRAM_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const programId   = req.query.programId as string | undefined;
      const isEligible  = req.query.isEligible as string | undefined;
      const page        = Math.max(1, parseInt(req.query.page  as string || '1',  10));
      const limit       = Math.min(100, parseInt(req.query.limit as string || '50', 10));
      const offset      = (page - 1) * limit;

      const eligibleFilter = isEligible === 'true'
        ? 'AND pe.is_eligible = TRUE'
        : isEligible === 'false'
        ? 'AND pe.is_eligible = FALSE'
        : '';

      const { rows } = await db.query(
        `SELECT pe.student_id, pe.total_score, pe.maximum_score, pe.threshold_score,
                pe.is_eligible, pe.reason, pe.evaluated_at,
                u.name AS student_name, u.email AS student_email,
                s.roll_number
         FROM placement.placement_eligibility pe
         JOIN org.students s ON s.id = pe.student_id
         JOIN identity.users u ON u.id = s.user_id
         LEFT JOIN org.batches b ON b.id = s.batch_id
         WHERE ($1::uuid IS NULL OR b.program_id = $1)
         ${eligibleFilter}
         ORDER BY pe.is_eligible DESC, pe.total_score DESC
         LIMIT $2 OFFSET $3`,
        [programId ?? null, limit, offset]
      );

      const { rows: countRows } = await db.query(
        `SELECT COUNT(*) AS total
         FROM placement.placement_eligibility pe
         JOIN org.students s ON s.id = pe.student_id
         LEFT JOIN org.batches b ON b.id = s.batch_id
         WHERE ($1::uuid IS NULL OR b.program_id = $1)
         ${eligibleFilter}`,
        [programId ?? null]
      );

      sendSuccess(res, {
        report: rows,
        pagination: { total: parseInt(countRows[0].total as string, 10), page, limit },
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/placement-eligibility/:studentId
placementRouter.get(
  '/:studentId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const studentId = req.params.studentId as string;
      const role = req.user!.role;
      const userId = req.user!.id;

      // Students can only view their own eligibility
      if (role === 'STUDENT') {
        const { rows } = await db.query(
          'SELECT id FROM org.students WHERE id = $1 AND user_id = $2',
          [studentId, userId]
        );
        if (rows.length === 0) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      const { rows } = await db.query(
        `SELECT id, student_id, total_score, maximum_score, threshold_score,
                is_eligible, blocking_reasons, reason, evaluated_at, updated_at
         FROM placement.placement_eligibility WHERE student_id = $1`,
        [studentId]
      );

      if (rows.length === 0) {
        // No record yet — run calculation on demand
        await EligibilityService.recalculate(studentId);
        const { rows: fresh } = await db.query(
          `SELECT id, student_id, total_score, maximum_score, threshold_score,
                  is_eligible, blocking_reasons, reason, evaluated_at
           FROM placement.placement_eligibility WHERE student_id = $1`,
          [studentId]
        );
        sendSuccess(res, { eligibility: fresh[0] ?? null });
        return;
      }

      sendSuccess(res, { eligibility: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/placement-eligibility/:studentId/recalculate
placementRouter.post(
  '/:studentId/recalculate',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR', 'PROGRAM_ADMIN', 'FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const studentId = req.params.studentId as string;

      await EligibilityService.recalculate(studentId);

      const { rows } = await db.query(
        `SELECT id, student_id, total_score, maximum_score, threshold_score,
                is_eligible, blocking_reasons, reason, evaluated_at
         FROM placement.placement_eligibility WHERE student_id = $1`,
        [studentId]
      );

      sendSuccess(res, { eligibility: rows[0] ?? null });
    } catch (err) {
      sendError(res, err);
    }
  }
);

