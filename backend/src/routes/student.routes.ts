import { Router, Response } from 'express';
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
// ── GET /api/students/me ─────────────────────────────────────────────────────

studentRouter.get(
  '/me',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const { rows } = await db.query(
        `SELECT s.id, s.roll_number, s.batch_id, s.subdivision_id,
                s.coding_handles, s.resume_url, s.resume_verified, s.parsed_resume,
                s.created_at, s.updated_at,
                u.id AS user_id, u.name, u.email, u.role, u.status
         FROM org.students s
         JOIN identity.users u ON u.id = s.user_id
         WHERE s.user_id = $1`,
        [userId]
      );

      if (rows.length === 0) {
        throw new AppError(404, 'Student not found', 'NOT_FOUND');
      }

      sendSuccess(res, { student: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/students/me/credits ─────────────────────────────────────────────
// Returns the authenticated student's credit balance from DB.
// DB is source of truth; frontend syncs student.coins from this on load.

studentRouter.get(
  '/me/credits',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const { rows: studentRows } = await db.query(
        'SELECT id FROM org.students WHERE user_id = $1',
        [userId]
      );
      if (studentRows.length === 0) {
        sendSuccess(res, { balance: 0, hasAccount: false });
        return;
      }
      const studentId = studentRows[0].id as string;

      const { rows } = await db.query(
        'SELECT balance FROM credit.credit_accounts WHERE student_id = $1',
        [studentId]
      );
      sendSuccess(res, {
        studentId,
        balance: rows.length > 0 ? Number(rows[0].balance) : 0,
        hasAccount: rows.length > 0
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

studentRouter.get(
  '/:studentId',
  authenticate,
  requireStudentSelfOrStaff,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const { rows } = await db.query(
        `SELECT s.id, s.roll_number, s.batch_id, s.subdivision_id, s.coding_handles,
                s.resume_url, s.resume_verified, s.parsed_resume, s.created_at, s.updated_at,
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
  authenticate,
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
// Uploads the PDF, calls the AI service to parse it, and persists both the
// file URL and the structured parsed_resume in a single request.

studentRouter.patch(
  '/:studentId/resume',
  authenticate,
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

      const allowedMimeTypes = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        throw new AppError(422, 'Only PDF and DOCX files are accepted', 'INVALID_FILE_TYPE');
      }

      // 1. Persist the raw file to storage
      const fileExt = req.file.mimetype === 'application/pdf' ? 'pdf' : 'docx';
      const storageFilename = `resumes/${randomUUID()}.${fileExt}`;
      const resumeUrl = await storage.upload(req.file.buffer, storageFilename, req.file.mimetype);

      // 2. Call AI service to parse the PDF into structured JSON
      let parsedData: Record<string, unknown> | null = null;
      try {
        const formData = new FormData();
        // Use native Blob in Node.js v18+
        const blob = new Blob([req.file.buffer], { type: 'application/pdf' });
        formData.append('file', blob, req.file.originalname || 'resume.pdf');

        const aiServiceUrl = env.AI_SERVICE_URL || 'http://localhost:8001';
        const parseResponse = await fetch(`${aiServiceUrl}/resume/parse`, {
          method: 'POST',
          body: formData,
        });

        if (parseResponse.ok) {
          parsedData = await parseResponse.json() as Record<string, unknown>;
        } else {
          console.error('[resume upload] AI parse failed:', parseResponse.status, await parseResponse.text());
        }
      } catch (parseErr) {
        // Parsing failure is non-fatal — we still save the file URL
        console.error('[resume upload] AI parse error:', parseErr);
      }

      // 3. Persist file URL and (if available) parsed_resume atomically
      if (parsedData) {
        await db.query(
          `UPDATE org.students
           SET resume_url = $1, resume_verified = false,
               parsed_resume = $2, updated_at = now()
           WHERE id = $3`,
          [resumeUrl, JSON.stringify(parsedData), studentId]
        );
      } else {
        await db.query(
          `UPDATE org.students
           SET resume_url = $1, resume_verified = false, updated_at = now()
           WHERE id = $2`,
          [resumeUrl, studentId]
        );
      }

      sendSuccess(res, {
        resumeUrl,
        resumeData: parsedData,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── POST /api/students/:studentId/parse-resume ────────────────────────────────

studentRouter.post(
  '/:studentId/parse-resume',
  authenticate,
  requireStudentSelfOrStaff,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const user = req.user!;

      // Fetch student and verify access
      const { rows: existing } = await db.query(
        'SELECT id, user_id, resume_url FROM org.students WHERE id = $1',
        [studentId]
      );
      if (existing.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      if (user.role === 'STUDENT' && existing[0].user_id !== user.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      const resumeUrl = existing[0].resume_url;
      if (!resumeUrl) {
        throw new AppError(422, 'No resume uploaded yet', 'NO_RESUME');
      }

      // Fetch the resume PDF from storage
      const pdfBuffer = await storage.download(resumeUrl);

      // Call AI service to parse the resume
      const formData = new FormData();
      const blob = new Blob([pdfBuffer], { type: 'application/pdf' });
      formData.append('file', blob, 'resume.pdf');

      const aiServiceUrl = env.AI_SERVICE_URL || 'http://localhost:8001';
      const parseResponse = await fetch(`${aiServiceUrl}/resume/parse`, {
        method: 'POST',
        body: formData,
      });

      if (!parseResponse.ok) {
        throw new AppError(502, 'Failed to parse resume', 'AI_SERVICE_ERROR');
      }

      const parsedData = await parseResponse.json();

      // Store parsed data in database
      const { rows } = await db.query(
        `UPDATE org.students
         SET parsed_resume = $1, updated_at = now()
         WHERE id = $2 RETURNING parsed_resume`,
        [JSON.stringify(parsedData), studentId]
      );

      sendSuccess(res, { resumeData: rows[0].parsed_resume });
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
