import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { CreditService } from '../credits/credits.service.stub';

export const attemptsRouter = Router();

const startSchema = z.object({
  assessmentId: z.string().uuid(),
});

// POST /api/attempts/start
attemptsRouter.post(
  '/start',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = startSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { assessmentId } = parsed.data;
      const userId = req.user!.id;

      // Resolve student record
      const { rows: students } = await db.query(
        `SELECT s.id AS student_id, s.batch_id, s.subdivision_id, b.program_id
         FROM org.students s
         JOIN org.batches b ON b.id = s.batch_id
         WHERE s.user_id = $1`,
        [userId]
      );
      if (students.length === 0) throw new AppError(404, 'Student record not found', 'NOT_FOUND');
      const { student_id, batch_id, subdivision_id, program_id } = students[0];

      // Check assessment exists
      const { rows: assessments } = await db.query(
        `SELECT id, assessment_type, interview_type, version, is_active
         FROM assessment.assessments WHERE id = $1`,
        [assessmentId]
      );
      if (assessments.length === 0) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');
      if (!assessments[0].is_active) throw new AppError(409, 'Assessment is not active', 'ASSESSMENT_INACTIVE');

      // Guard: no concurrent IN_PROGRESS attempt for same assessment
      const { rows: active } = await db.query(
        `SELECT id FROM assessment.assessment_attempts
         WHERE student_id = $1 AND assessment_id = $2 AND status = 'IN_PROGRESS'`,
        [student_id, assessmentId]
      );
      if (active.length > 0) {
        throw new AppError(409, 'You already have an active attempt for this assessment', 'ATTEMPT_IN_PROGRESS');
      }

      // Step 1: Consume credits BEFORE creating attempt (M4 stub for now)
      const creditCost = 1;
      const { newBalance } = await CreditService.consume(
        student_id,
        creditCost,
        'ASSESSMENT_START',
        assessmentId
      );

      // Step 2: Create attempt
      const assessment = assessments[0];
      const { rows: attempt } = await db.query(
        `INSERT INTO assessment.assessment_attempts
           (assessment_id, student_id, interview_type, program_id, batch_id, subdivision_id,
            assessment_version, scoring_version, credit_policy_snapshot, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, '1.0', $8, 'IN_PROGRESS')
         RETURNING id, assessment_id, student_id, status, started_at`,
        [
          assessmentId,
          student_id,
          assessment.interview_type,
          program_id,
          batch_id,
          subdivision_id,
          assessment.version,
          JSON.stringify({ credit_cost: creditCost }),
        ]
      );

      sendSuccess(res, {
        attemptId: attempt[0].id,
        status: attempt[0].status,
        creditBalance: newBalance,
      }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/attempts/:id
attemptsRouter.get(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user!;

      const { rows } = await db.query(
        `SELECT a.id, a.assessment_id, a.student_id, a.status, a.interview_type,
                a.started_at, a.completed_at, a.assessment_version, a.scoring_version,
                s.user_id AS student_user_id
         FROM assessment.assessment_attempts a
         JOIN org.students s ON s.id = a.student_id
         WHERE a.id = $1`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');

      const attempt = rows[0];

      // Access control: student sees only own; mentor/admin sees all
      if (user.role === 'STUDENT' && attempt.student_user_id !== user.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      sendSuccess(res, { attempt });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/attempts/:id/abandon
attemptsRouter.put(
  '/:id/abandon',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const { rows: existing } = await db.query(
        `SELECT a.id, a.status, s.user_id AS student_user_id
         FROM assessment.assessment_attempts a
         JOIN org.students s ON s.id = a.student_id
         WHERE a.id = $1`,
        [id]
      );
      if (existing.length === 0) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
      if (existing[0].student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      if (existing[0].status !== 'IN_PROGRESS') {
        throw new AppError(409, 'Only IN_PROGRESS attempts can be abandoned', 'INVALID_STATUS');
      }

      await db.query(
        `UPDATE assessment.assessment_attempts SET status = 'ABANDONED', completed_at = now()
         WHERE id = $1`,
        [id]
      );

      // B6: if a session exists and is still active/paused, terminate it
      await db.query(
        `UPDATE session.assessment_sessions
         SET state = 'TERMINATED', updated_at = now()
         WHERE attempt_id = $1 AND state IN ('ACTIVE', 'PAUSED')`,
        [id]
      );

      sendSuccess(res, { message: 'Attempt abandoned' });
    } catch (err) {
      sendError(res, err);
    }
  }
);
