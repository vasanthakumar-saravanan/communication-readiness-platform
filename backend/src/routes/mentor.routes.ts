import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

export const mentorRouter = Router();

// ── POST /api/mentors/assign (PROGRAM_ADMIN) ──────────────────────────────────

const assignSchema = z.object({
  studentId: z.string().uuid(),
  mentorId: z.string().uuid(),
});

mentorRouter.post(
  '/assign',
  requireRole('PROGRAM_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = assignSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');

      const { studentId, mentorId } = parsed.data;
      const assignedBy = req.user!.id;

      // Verify mentor exists and has the correct role
      const { rows: mentor } = await db.query(
        `SELECT id FROM identity.users WHERE id = $1 AND role = 'FACULTY_MENTOR'`,
        [mentorId]
      );
      if (mentor.length === 0) {
        throw new AppError(404, 'Mentor not found or not a FACULTY_MENTOR', 'NOT_FOUND');
      }

      // Verify student exists
      const { rows: student } = await db.query(
        `SELECT id FROM org.students WHERE id = $1`,
        [studentId]
      );
      if (student.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      // Deactivate + insert must be atomic — a crash between them would leave the student
      // with no active mentor, breaking all subsequent mentor-scoped operations.
      const client = await db.connect();
      let assignmentId: string;
      try {
        await client.query('BEGIN');
        await client.query(
          `UPDATE org.student_mentor_assignments SET is_active = false
           WHERE student_id = $1 AND is_active = true`,
          [studentId]
        );
        const { rows } = await client.query<{ id: string }>(
          `INSERT INTO org.student_mentor_assignments (student_id, mentor_id, assigned_by, is_active)
           VALUES ($1, $2, $3, true) RETURNING id`,
          [studentId, mentorId, assignedBy]
        );
        await client.query('COMMIT');
        assignmentId = rows[0].id;
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }

      sendSuccess(res, { assignment: { id: assignmentId, studentId, mentorId } }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/mentors/my-students (FACULTY_MENTOR) ────────────────────────────

mentorRouter.get(
  '/my-students',
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const mentorId = req.user!.id;
      const { rows } = await db.query(
        `SELECT s.id, s.roll_number, s.resume_url, s.resume_verified,
                u.name, u.email,
                b.name as batch_name, b.track,
                sub.name as subdivision_name
         FROM org.student_mentor_assignments sma
         JOIN org.students s ON s.id = sma.student_id
         JOIN identity.users u ON u.id = s.user_id
         LEFT JOIN org.batches b ON b.id = s.batch_id
         LEFT JOIN org.subdivisions sub ON sub.id = s.subdivision_id
         WHERE sma.mentor_id = $1 AND sma.is_active = true
         ORDER BY u.name`,
        [mentorId]
      );
      sendSuccess(res, { students: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);
