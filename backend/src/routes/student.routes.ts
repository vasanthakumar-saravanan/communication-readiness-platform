import { Router, Request, Response } from 'express';
import multer from 'multer';
import axios from 'axios';
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
import { STUDENT_SUMMARY_SELECT } from '../services/studentDirectory';
import { assertStudentAccess } from '../shared/auth/studentScope';

export const studentRouter = Router();

const storage = new LocalStorageClient();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 },
});

const STUDENT_PROFILE_SELECT = STUDENT_SUMMARY_SELECT;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── GET /api/students/coding-stats/leetcode/:username ─────────────────────────
// Server-side lookup: leetcode.com does not allow browser (CORS) requests.

const LEETCODE_QUERY = `
  query userProblemsSolved($username: String!) {
    matchedUser(username: $username) {
      submitStats { acSubmissionNum { difficulty count } }
    }
  }`;

studentRouter.get(
  '/coding-stats/leetcode/:username',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const username = String(req.params.username ?? '').trim();
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(username)) {
        throw new AppError(422, 'Invalid LeetCode username', 'VALIDATION_ERROR');
      }
      let stats: { difficulty: string; count: number }[] | undefined;
      try {
        const { data } = await axios.post(
          'https://leetcode.com/graphql',
          { query: LEETCODE_QUERY, variables: { username } },
          { timeout: 8000, headers: { 'Content-Type': 'application/json', Referer: 'https://leetcode.com' } }
        );
        stats = data?.data?.matchedUser?.submitStats?.acSubmissionNum;
      } catch {
        throw new AppError(503, 'LeetCode could not be reached right now', 'UPSTREAM_UNAVAILABLE');
      }
      if (!stats) throw new AppError(404, 'LeetCode user not found', 'NOT_FOUND');
      // "All" is already the total; adding Easy/Medium/Hard to it double-counts
      const solved = stats.find(s => s.difficulty === 'All')?.count
        ?? stats.reduce((sum, s) => sum + (s.count || 0), 0);
      sendSuccess(res, { username, solved });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ── GET /api/students/me ─────────────────────────────────────────────────────

studentRouter.get(
  '/me',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const { rows } = await db.query(`${STUDENT_PROFILE_SELECT} WHERE s.user_id = $1`, [userId]);

      if (rows.length === 0) {
        throw new AppError(404, 'Student not found', 'NOT_FOUND');
      }

      sendSuccess(res, { student: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

studentRouter.get(
  '/:studentId',
  requireStudentSelfOrStaff,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const studentId = req.params.studentId as string;
      if (!UUID_RE.test(studentId)) throw new AppError(404, 'Student not found', 'NOT_FOUND');
      const { rows } = await db.query(`${STUDENT_PROFILE_SELECT} WHERE s.id = $1`, [studentId]);
      if (rows.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      // Students: own record only; mentors: assigned students only
      await assertStudentAccess(req.user!, studentId);

      sendSuccess(res, { student: rows[0] });
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
      const studentId = req.params.studentId as string;
      if (!UUID_RE.test(studentId)) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      const { rows: existing } = await db.query(
        'SELECT id, user_id, coding_handles FROM org.students WHERE id = $1',
        [studentId]
      );
      if (existing.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      // Students: own record only; mentors: assigned students only
      await assertStudentAccess(req.user!, studentId);

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

// ── GET /api/students/:studentId/resume ───────────────────────────────────────

studentRouter.get(
  '/:studentId/resume',
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const studentId = req.params.studentId as string;

      // Verify student exists
      const { rows: existing } = await db.query(
        'SELECT id FROM org.students WHERE id = $1',
        [studentId]
      );
      if (existing.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');

      // Students: own resume only; mentors: assigned students only; staff: any student
      await assertStudentAccess(req.user!, studentId);

      // Fetch current resume with parsed data
      const { rows: resumes } = await db.query(
        `SELECT id, file_name, parsed_data, created_at
         FROM org.resumes
         WHERE student_id = $1 AND is_current = true
         ORDER BY created_at DESC
         LIMIT 1`,
        [studentId]
      );

      if (resumes.length === 0) {
        sendSuccess(res, { resume: null });
        return;
      }

      const resume = resumes[0];
      sendSuccess(res, {
        id: resume.id,
        fileName: resume.file_name,
        parsedData: resume.parsed_data,
        parsedAt: resume.created_at.toISOString().split('T')[0]
      });
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

      // Upload file first; if the DB transaction fails we clean up the orphaned file.
      const filename = `resumes/${randomUUID()}.pdf`;
      const resumeUrl = await storage.upload(req.file.buffer, filename, 'application/pdf');

      // org.resumes keeps every version; the new upload becomes current and any
      // earlier mentor sign-off no longer applies to it.
      const client = await db.connect();
      let version: number;
      let resumeId: string;
      try {
        await client.query('BEGIN');
        await client.query(
          'UPDATE org.resumes SET is_current = false, updated_at = now() WHERE student_id = $1 AND is_current = true',
          [studentId]
        );
        const { rows } = await client.query<{ id: string; version: number }>(
          `INSERT INTO org.resumes (student_id, version, object_key, file_name, is_current)
           VALUES ($1, COALESCE((SELECT MAX(version) FROM org.resumes WHERE student_id = $1), 0) + 1, $2, $3, true)
           RETURNING id, version`,
          [studentId, resumeUrl, req.file.originalname]
        );
        resumeId = rows[0].id;
        version = rows[0].version;
        await client.query(
          `UPDATE placement.mentor_verifications SET status = 'PENDING', verified_at = NULL, updated_at = now()
           WHERE student_id = $1 AND verification_type = 'PROFILE'`,
          [studentId]
        );
        await client.query('COMMIT');
      } catch (txErr) {
        await client.query('ROLLBACK');
        // Clean up the uploaded file so we don't leave orphaned files on disk.
        try { await storage.delete(filename); } catch (_) { /* best-effort */ }
        throw txErr;
      } finally {
        client.release();
      }

      // Parse resume synchronously so the response includes parsed_data.
      // 60s timeout — if AI service is slow or down, we still return success without parsed data.
      let parsedData: Record<string, unknown> | null = null;
      try {
        const parseRes = await axios.post(
          `${env.AI_SERVICE_URL}/internal/parse-resume`,
          {
            pdf_base64: req.file.buffer.toString('base64'),
            student_id: studentId,
            resume_id: resumeId,
          },
          { headers: { 'X-Internal-Key': env.INTERNAL_API_KEY }, timeout: 60_000 }
        );
        // Fetch the parsed_data the AI service just wrote to the DB
        const { rows: resumeRows } = await db.query<{ parsed_data: Record<string, unknown> | null }>(
          'SELECT parsed_data FROM org.resumes WHERE id = $1',
          [resumeId]
        );
        parsedData = resumeRows[0]?.parsed_data ?? null;
      } catch (parseErr: unknown) {
        const msg = parseErr instanceof Error ? parseErr.message : String(parseErr);
        console.error('[resume-parse] parse failed (non-fatal):', msg);
      }

      sendSuccess(res, { resumeUrl, fileName: req.file.originalname, version, parsedData });
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
         WHERE student_id = $1 AND mentor_user_id = $2 AND is_active = true`,
        [studentId, mentorId]
      );
      if (assignment.length === 0) {
        throw new AppError(403, 'You are not assigned to this student', 'FORBIDDEN');
      }

      const { rows: resume } = await db.query(
        'SELECT id FROM org.resumes WHERE student_id = $1 AND is_current = true',
        [studentId]
      );
      if (resume.length === 0) throw new AppError(422, 'The student has not uploaded a resume', 'NO_RESUME');

      // Resume sign-off is a PROFILE verification (placement.mentor_verifications, per DBML)
      const { rowCount } = await db.query(
        `UPDATE placement.mentor_verifications
         SET status = 'VERIFIED', mentor_user_id = $2, verified_at = now(), updated_at = now()
         WHERE student_id = $1 AND verification_type = 'PROFILE'`,
        [studentId, mentorId]
      );
      if (rowCount === 0) {
        await db.query(
          `INSERT INTO placement.mentor_verifications
             (student_id, mentor_user_id, verification_type, status, verified_at)
           VALUES ($1, $2, 'PROFILE', 'VERIFIED', now())`,
          [studentId, mentorId]
        );
      }

      const payload = { studentId, mentorId, verifiedAt: new Date().toISOString() };
      eventBus.emit(Events.MENTOR_VERIFIED, payload);

      sendSuccess(res, { message: 'Resume verified' });
    } catch (err) {
      sendError(res, err);
    }
  }
);
