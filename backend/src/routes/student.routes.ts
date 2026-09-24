import { Router, Request, Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { LocalStorageClient } from '../shared/storage/LocalStorageClient';
import { eventBus } from '../shared/events/eventBus';
import { Events } from '../shared/events/events';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { requireRole, requireStudentSelfOrStaff } from '../middleware/authorize';
import { env } from '../config/env';

export const studentRouter = Router();

const storage = new LocalStorageClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

// ── GET /api/students/:studentId ──────────────────────────────────────────────

studentRouter.get(
  '/:studentId',
  requireStudentSelfOrStaff,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const { rows } = await db.query(
        `SELECT s.id, s.roll_number, s.batch_id, s.subdivision_id, s.coding_handles,
                s.resume_url, s.resume_verified, s.created_at, s.updated_at,
                u.id as user_id, u.name, u.email, u.role, u.status
         FROM org.students s
         JOIN identity.users u ON u.id = s.user_id
         WHERE s.id = $1`,
        [studentId]
      );
      if (rows.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      const student = rows[0];
      // STUDENT may only access their own record
      if (req.user!.role === 'STUDENT' && student.user_id !== req.user!.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      sendSuccess(res, { student });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── PATCH /api/students/:studentId ───────────────────────────────────────────

const patchStudentSchema = z.object({
  codingHandles: z
    .object({
      github: z.string().optional(),
      leetcode: z.string().optional(),
      hackerrank: z.string().optional(),
      codeforces: z.string().optional(),
      codechef: z.string().optional(),
      leetcodeSolved: z.number().int().min(0).optional(),
      githubRepos: z.number().int().min(0).optional(),
    })
    .optional(),
});

studentRouter.patch(
  '/:studentId',
  requireStudentSelfOrStaff,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const user = req.user!;

      // Fetch student to verify ownership for STUDENT role
      const { rows: existing } = await db.query(
        'SELECT id, user_id, coding_handles FROM org.students WHERE id = $1',
        [studentId]
      );
      if (existing.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      if (user.role === 'STUDENT' && existing[0].user_id !== user.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      const parsed = patchStudentSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      }

      const merged = {
        ...((existing[0].coding_handles as object) ?? {}),
        ...(parsed.data.codingHandles ?? {}),
      };

      const { rows } = await db.query(
        `UPDATE org.students SET coding_handles = $1, updated_at = now()
         WHERE id = $2 RETURNING *`,
        [JSON.stringify(merged), studentId]
      );

      sendSuccess(res, { student: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── PATCH /api/students/:studentId/resume ─────────────────────────────────────

studentRouter.patch(
  '/:studentId/resume',
  upload.single('resume'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const user = req.user!;

      // Only the student themselves may upload their resume
      const { rows: existing } = await db.query(
        'SELECT id, user_id FROM org.students WHERE id = $1',
        [studentId]
      );
      if (existing.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');
      if (existing[0].user_id !== user.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      if (!req.file) throw new AppError(422, 'Resume file required', 'FILE_REQUIRED');
      if (req.file.mimetype !== 'application/pdf') {
        throw new AppError(422, 'Only PDF files are accepted', 'INVALID_FILE_TYPE');
      }

      const filename = `resumes/${randomUUID()}.pdf`;
      const resumeUrl = await storage.upload(req.file.buffer, filename, 'application/pdf');

      const { rows } = await db.query(
        `UPDATE org.students
         SET resume_url = $1, resume_verified = false, updated_at = now()
         WHERE id = $2 RETURNING resume_url`,
        [resumeUrl, studentId]
      );

      sendSuccess(res, { resumeUrl: rows[0].resume_url });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── PATCH /api/students/:studentId/verify-resume (FACULTY_MENTOR) ─────────────

studentRouter.patch(
  '/:studentId/verify-resume',
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const mentorId = req.user!.id;

      // Confirm this mentor is actively assigned to this student
      const { rows: assignment } = await db.query(
        `SELECT id FROM org.student_mentor_assignments
         WHERE student_id = $1 AND mentor_id = $2 AND is_active = true`,
        [studentId, mentorId]
      );
      if (assignment.length === 0) {
        throw new AppError(403, 'You are not assigned to this student', 'FORBIDDEN');
      }

      await db.query(
        `UPDATE org.students SET resume_verified = true, updated_at = now() WHERE id = $1`,
        [studentId]
      );

      const payload = { studentId, mentorId, verifiedAt: new Date().toISOString() };
      eventBus.emit(Events.MENTOR_VERIFIED, payload);

      sendSuccess(res, { message: 'Resume verified' });
    } catch (err) {
      sendError(res, err);
    }
  }
);
