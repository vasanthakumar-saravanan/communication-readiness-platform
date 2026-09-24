import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

export const trainerRouter = Router();

// ── POST /api/trainers/assign (PROGRAM_ADMIN) ─────────────────────────────────

const assignSchema = z.object({
  trainerId: z.string().uuid(),
  subdivisionId: z.string().uuid(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'startDate must be YYYY-MM-DD'),
  endDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'endDate must be YYYY-MM-DD')
    .optional(),
});

trainerRouter.post(
  '/assign',
  requireRole('PROGRAM_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');

      const { trainerId, subdivisionId, startDate, endDate } = parsed.data;
      const assignedBy = req.user!.id;

      // Verify trainer exists and has correct role
      const { rows: trainer } = await db.query(
        `SELECT id FROM identity.users WHERE id = $1 AND role = 'TRAINER'`,
        [trainerId]
      );
      if (trainer.length === 0) {
        throw new AppError(404, 'Trainer not found or not a TRAINER', 'NOT_FOUND');
      }

      // Verify subdivision exists
      const { rows: sub } = await db.query(
        `SELECT id FROM org.subdivisions WHERE id = $1`,
        [subdivisionId]
      );
      if (sub.length === 0) throw new AppError(404, 'Subdivision not found', 'NOT_FOUND');

      const { rows } = await db.query(
        `INSERT INTO org.trainer_subdivision_assignments
           (trainer_id, subdivision_id, start_date, end_date, assigned_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [trainerId, subdivisionId, startDate, endDate ?? null, assignedBy]
      );

      sendSuccess(res, { assignment: { id: rows[0].id } }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/trainers/my-subdivisions (TRAINER) ───────────────────────────────

trainerRouter.get(
  '/my-subdivisions',
  requireRole('TRAINER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const trainerId = req.user!.id;
      const { rows } = await db.query(
        `SELECT tsa.id, tsa.start_date, tsa.end_date,
                sub.id as subdivision_id, sub.name as subdivision_name, sub.type,
                b.name as batch_name, b.track, b.year
         FROM org.trainer_subdivision_assignments tsa
         JOIN org.subdivisions sub ON sub.id = tsa.subdivision_id
         JOIN org.batches b ON b.id = sub.batch_id
         WHERE tsa.trainer_id = $1
           AND (tsa.end_date IS NULL OR tsa.end_date >= CURRENT_DATE)
         ORDER BY tsa.start_date DESC`,
        [trainerId]
      );
      sendSuccess(res, { subdivisions: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);
