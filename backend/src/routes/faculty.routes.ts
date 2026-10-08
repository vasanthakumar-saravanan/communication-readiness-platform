/**
 * Faculty / Trainer Routes
 *
 * Scope model:
 *  - PROGRAM_ADMIN assigns a FACULTY_MENTOR to one or more programs/subdivisions
 *    by inserting rows into identity.role_assignments (scope_type='FACULTY_SCOPE').
 *  - FACULTY_MENTOR may only create drill assignments that target a program_id or
 *    subdivision_id explicitly granted in their role_assignments rows.
 *  - PROGRAM_ADMIN and PLACEMENT_COORDINATOR are NOT scope-restricted.
 *  - TRAINER scope is already enforced separately via requireActiveTrainerTenure.
 *
 * Endpoints:
 *  POST /api/faculty/scope-assignments      — PROGRAM_ADMIN: grant faculty a program/subdivision scope
 *  GET  /api/faculty/scope-assignments/:uid — PROGRAM_ADMIN: list scopes for a specific faculty user
 *  GET  /api/faculty/my-scopes              — FACULTY_MENTOR: list own authorised programs/subdivisions
 *  POST /api/faculty/drills                 — FACULTY_MENTOR/PROGRAM_ADMIN: create drill with scope check
 *  GET  /api/faculty/drills                 — FACULTY_MENTOR: list own drills
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';

export const facultyRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/faculty/scope-assignments  (PROGRAM_ADMIN only)
// Grant a FACULTY_MENTOR access to a program and/or subdivision.
// Uses the existing identity.role_assignments table (scope_type = 'FACULTY_SCOPE').
// ─────────────────────────────────────────────────────────────────────────────

const grantScopeSchema = z.object({
  userId:        z.string().uuid(),
  programId:     z.string().uuid().optional(),
  subdivisionId: z.string().uuid().optional(),
}).refine(d => d.programId || d.subdivisionId, {
  message: 'At least one of programId or subdivisionId is required',
});

facultyRouter.post(
  '/scope-assignments',
  requireRole('PROGRAM_ADMIN', 'PLATFORM_OWNER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = grantScopeSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(422, parsed.error.errors[0]?.message ?? 'Validation failed', 'VALIDATION_ERROR');
      }
      const { userId, programId, subdivisionId } = parsed.data;

      // Verify target user is FACULTY_MENTOR
      const { rows: userRows } = await db.query(
        `SELECT id, role FROM identity.users WHERE id = $1`,
        [userId]
      );
      if (userRows.length === 0) throw new AppError(404, 'User not found', 'NOT_FOUND');
      if (userRows[0].role !== 'FACULTY_MENTOR') {
        throw new AppError(422, 'Target user must have the FACULTY_MENTOR role', 'VALIDATION_ERROR');
      }

      // Verify program exists if provided
      if (programId) {
        const { rows: progRows } = await db.query(
          'SELECT id FROM org.programs WHERE id = $1', [programId]
        );
        if (progRows.length === 0) throw new AppError(404, 'Program not found', 'NOT_FOUND');
      }

      // Verify subdivision exists if provided
      if (subdivisionId) {
        const { rows: subRows } = await db.query(
          'SELECT id FROM org.subdivisions WHERE id = $1', [subdivisionId]
        );
        if (subRows.length === 0) throw new AppError(404, 'Subdivision not found', 'NOT_FOUND');
      }

      // Look up role id for FACULTY_MENTOR
      const { rows: roleRows } = await db.query(
        `SELECT id FROM identity.roles WHERE name = 'FACULTY_MENTOR' LIMIT 1`
      );
      if (roleRows.length === 0) throw new AppError(500, 'FACULTY_MENTOR role not seeded', 'INTERNAL_ERROR');
      const roleId = roleRows[0].id;

      // Insert scope assignment (idempotent: skip if identical row exists)
      const { rows: inserted } = await db.query(
        `INSERT INTO identity.role_assignments
           (user_id, role_id, scope_type, program_id, subdivision_id, is_active)
         VALUES ($1, $2, 'FACULTY_SCOPE', $3, $4, true)
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [userId, roleId, programId ?? null, subdivisionId ?? null]
      );

      sendSuccess(res, {
        granted: inserted.length > 0,
        userId,
        programId:     programId ?? null,
        subdivisionId: subdivisionId ?? null,
      }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/scope-assignments/:uid  (PROGRAM_ADMIN — inspect a user's scopes)
// ─────────────────────────────────────────────────────────────────────────────

facultyRouter.get(
  '/scope-assignments/:uid',
  requireRole('PROGRAM_ADMIN', 'PLATFORM_OWNER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { uid } = req.params;

      const { rows } = await db.query(
        `SELECT
           ra.id,
           ra.program_id,
           p.name      AS program_name,
           p.code      AS program_code,
           ra.subdivision_id,
           sub.name    AS subdivision_name,
           sub.type    AS subdivision_type,
           ra.is_active,
           ra.created_at
         FROM identity.role_assignments ra
         JOIN identity.roles r ON r.id = ra.role_id AND r.name = 'FACULTY_MENTOR'
         LEFT JOIN org.programs      p   ON p.id   = ra.program_id
         LEFT JOIN org.subdivisions  sub ON sub.id = ra.subdivision_id
         WHERE ra.user_id = $1
           AND ra.scope_type = 'FACULTY_SCOPE'
         ORDER BY ra.created_at DESC`,
        [uid]
      );

      sendSuccess(res, { scopes: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/my-scopes  (FACULTY_MENTOR — own authorised scopes)
// Returns programs and subdivisions this faculty is allowed to target.
// ─────────────────────────────────────────────────────────────────────────────

facultyRouter.get(
  '/my-scopes',
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const { rows } = await db.query(
        `SELECT
           ra.id,
           ra.program_id,
           p.name      AS program_name,
           p.code      AS program_code,
           ra.subdivision_id,
           sub.name    AS subdivision_name,
           sub.type    AS subdivision_type,
           b.track     AS batch_track
         FROM identity.role_assignments ra
         JOIN identity.roles r ON r.id = ra.role_id AND r.name = 'FACULTY_MENTOR'
         LEFT JOIN org.programs      p   ON p.id   = ra.program_id
         LEFT JOIN org.subdivisions  sub ON sub.id = ra.subdivision_id
         LEFT JOIN org.batches       b   ON b.id   = sub.batch_id
         WHERE ra.user_id = $1
           AND ra.scope_type = 'FACULTY_SCOPE'
           AND ra.is_active  = true
         ORDER BY p.name NULLS LAST, sub.name NULLS LAST`,
        [userId]
      );

      sendSuccess(res, { scopes: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/faculty/drills  (FACULTY_MENTOR / PROGRAM_ADMIN / PLACEMENT_COORDINATOR)
//
// SCOPE ENFORCEMENT:
//   - FACULTY_MENTOR  → request program_id or subdivision_id must match a row in
//                        identity.role_assignments (scope_type='FACULTY_SCOPE').
//                        Unauthorised targets are rejected with HTTP 403.
//   - PROGRAM_ADMIN / PLACEMENT_COORDINATOR → no scope restriction.
// ─────────────────────────────────────────────────────────────────────────────

const createDrillSchema = z.object({
  title:              z.string().min(1).max(255),
  sessionType:        z.enum(['MOCK_INTERVIEW','LISTENING_COMPREHENSION','BOTH']),
  targetScope:        z.enum(['PROGRAM','SUBDIVISION','MY_MENTEES','SPECIFIC_STUDENT','ALL_STUDENTS']),
  programId:          z.string().uuid().optional(),
  subdivisionId:      z.string().uuid().optional(),
  targetUserId:       z.string().uuid().optional(),
  interviewMode:      z.enum(['TOPIC','RESUME_BASED']).optional(),
  domainOrTopic:      z.string().max(255).optional(),
  difficulty:         z.enum(['EASY','MEDIUM','ADVANCED','FAANG']).optional(),
  listeningPassageId: z.string().max(100).optional(),
  customInstructions: z.string().optional(),
  dueDate:            z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'dueDate must be YYYY-MM-DD'),
  startTime:          z.string().regex(/^\d{2}:\d{2}$/).optional(),
  endTime:            z.string().regex(/^\d{2}:\d{2}$/).optional(),
  isMandatory:        z.boolean().optional(),
});

facultyRouter.post(
  '/drills',
  requireRole('FACULTY_MENTOR', 'PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR', 'PLATFORM_OWNER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = createDrillSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new AppError(422, parsed.error.errors[0]?.message ?? 'Validation failed', 'VALIDATION_ERROR');
      }

      const {
        title, sessionType, targetScope,
        programId, subdivisionId, targetUserId,
        interviewMode, domainOrTopic, difficulty, listeningPassageId, customInstructions,
        dueDate, startTime, endTime, isMandatory,
      } = parsed.data;

      const user = req.user!;

      // ── SCOPE ENFORCEMENT FOR FACULTY_MENTOR ──────────────────────────────────
      if (user.role === 'FACULTY_MENTOR') {
        // MY_MENTEES scope is always allowed — it is implicitly scoped to their mentees
        if (targetScope !== 'MY_MENTEES' && targetScope !== 'SPECIFIC_STUDENT') {
          if (!programId && !subdivisionId) {
            throw new AppError(
              422,
              'FACULTY_MENTOR must specify programId or subdivisionId for this target scope',
              'VALIDATION_ERROR'
            );
          }

          // When subdivisionId is provided, check subdivision-level scope.
          // Only fall back to program-level check if no subdivisionId was given —
          // holding a program-scope row does NOT automatically grant all its subdivisions.
          const { rows: authCheck } = await db.query(
            `SELECT ra.id
             FROM identity.role_assignments ra
             JOIN identity.roles r ON r.id = ra.role_id AND r.name = 'FACULTY_MENTOR'
             WHERE ra.user_id    = $1
               AND ra.scope_type = 'FACULTY_SCOPE'
               AND ra.is_active  = true
               AND (
                 CASE
                   WHEN $3::uuid IS NOT NULL THEN ra.subdivision_id = $3
                   WHEN $2::uuid IS NOT NULL THEN ra.program_id     = $2
                   ELSE false
                 END
               )
             LIMIT 1`,
            [user.id, programId ?? null, subdivisionId ?? null]
          );

          if (authCheck.length === 0) {
            throw new AppError(
              403,
              'You are not authorised to create drills for the specified program or subdivision. ' +
              'Contact your Program Admin to be granted scope access.',
              'FACULTY_SCOPE_DENIED'
            );
          }
        }

        // SPECIFIC_STUDENT: verify the student is one of this faculty's mentees
        if (targetScope === 'SPECIFIC_STUDENT' && targetUserId) {
          const { rows: menteeCheck } = await db.query(
            `SELECT sma.id
             FROM org.student_mentor_assignments sma
             JOIN org.students s ON s.id = sma.student_id
             WHERE sma.mentor_id = $1
               AND s.user_id     = $2
               AND sma.is_active = true
             LIMIT 1`,
            [user.id, targetUserId]
          );
          if (menteeCheck.length === 0) {
            throw new AppError(
              403,
              'The specified student is not assigned to you as a mentee.',
              'FACULTY_SCOPE_DENIED'
            );
          }
        }
      }
      // ── END SCOPE ENFORCEMENT ─────────────────────────────────────────────────

      const { rows } = await db.query(
        `INSERT INTO org.drill_assignments
           (created_by, creator_role, title, session_type, target_scope,
            program_id, subdivision_id, target_user_id,
            interview_mode, domain_or_topic, difficulty,
            listening_passage_id, custom_instructions,
            due_date, start_time, end_time, is_mandatory)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING
           id, title, session_type, target_scope,
           program_id, subdivision_id, target_user_id,
           domain_or_topic, difficulty, due_date, is_mandatory, created_at`,
        [
          user.id,
          user.role,
          title,
          sessionType,
          targetScope,
          programId    ?? null,
          subdivisionId ?? null,
          targetUserId ?? null,
          interviewMode ?? 'TOPIC',
          domainOrTopic ?? null,
          difficulty    ?? 'MEDIUM',
          listeningPassageId ?? null,
          customInstructions ?? null,
          dueDate,
          startTime ?? null,
          endTime   ?? null,
          isMandatory ?? true,
        ]
      );

      sendSuccess(res, { drill: rows[0] }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/drills  (FACULTY_MENTOR — own drills)
// ─────────────────────────────────────────────────────────────────────────────

facultyRouter.get(
  '/drills',
  requireRole('FACULTY_MENTOR', 'PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      const { rows } = await db.query(
        `SELECT
           da.id,
           da.title,
           da.session_type,
           da.target_scope,
           da.program_id,
           p.name   AS program_name,
           da.subdivision_id,
           sub.name AS subdivision_name,
           da.domain_or_topic,
           da.difficulty,
           da.due_date,
           da.is_mandatory,
           da.is_active,
           da.created_at
         FROM org.drill_assignments da
         LEFT JOIN org.programs     p   ON p.id   = da.program_id
         LEFT JOIN org.subdivisions sub ON sub.id = da.subdivision_id
         WHERE da.created_by = $1
           AND da.is_active  = true
         ORDER BY da.created_at DESC`,
        [userId]
      );

      sendSuccess(res, { drills: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/students  (FACULTY_MENTOR / PROGRAM_ADMIN / PLACEMENT_COORDINATOR)
// Returns students in the faculty's authorised subdivisions/programs.
// PROGRAM_ADMIN and PLACEMENT_COORDINATOR see all students (capped at 200).
// ─────────────────────────────────────────────────────────────────────────────

facultyRouter.get(
  '/students',
  requireRole('FACULTY_MENTOR', 'PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR', 'PLATFORM_OWNER'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const user = req.user!;

      if (user.role === 'FACULTY_MENTOR') {
        const { rows } = await db.query(
          `SELECT DISTINCT s.id, u.name, u.email, s.roll_number,
                  b.name  AS batch_name, b.track,
                  sub.name AS subdivision_name, sub.type AS subdivision_type
           FROM org.students s
           JOIN identity.users u ON u.id = s.user_id AND u.status = 'ACTIVE'
           LEFT JOIN org.batches b ON b.id = s.batch_id
           LEFT JOIN org.subdivisions sub ON sub.id = s.subdivision_id
           WHERE (
             s.subdivision_id IN (
               SELECT ra.subdivision_id
               FROM identity.role_assignments ra
               JOIN identity.roles r ON r.id = ra.role_id AND r.name = 'FACULTY_MENTOR'
               WHERE ra.user_id = $1
                 AND ra.scope_type = 'FACULTY_SCOPE'
                 AND ra.is_active  = true
                 AND ra.subdivision_id IS NOT NULL
             )
             OR b.program_id IN (
               SELECT ra.program_id
               FROM identity.role_assignments ra
               JOIN identity.roles r ON r.id = ra.role_id AND r.name = 'FACULTY_MENTOR'
               WHERE ra.user_id = $1
                 AND ra.scope_type = 'FACULTY_SCOPE'
                 AND ra.is_active  = true
                 AND ra.program_id IS NOT NULL
             )
           )
           ORDER BY u.name
           LIMIT 200`,
          [user.id]
        );
        sendSuccess(res, { students: rows });
      } else {
        const { rows } = await db.query(
          `SELECT s.id, u.name, u.email, s.roll_number,
                  b.name  AS batch_name, b.track,
                  sub.name AS subdivision_name, sub.type AS subdivision_type
           FROM org.students s
           JOIN identity.users u ON u.id = s.user_id AND u.status = 'ACTIVE'
           LEFT JOIN org.batches b ON b.id = s.batch_id
           LEFT JOIN org.subdivisions sub ON sub.id = s.subdivision_id
           ORDER BY u.name
           LIMIT 200`
        );
        sendSuccess(res, { students: rows });
      }
    } catch (err) {
      sendError(res, err);
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/faculty/drills/for-student  (STUDENT — drills assigned to me)
// Returns drills targeting the student's subdivision or targeting them directly.
// ─────────────────────────────────────────────────────────────────────────────

facultyRouter.get(
  '/drills/for-student',
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;

      // Look up the student's subdivision
      const { rows: studentRows } = await db.query(
        `SELECT s.subdivision_id, s.batch_id, b.program_id
         FROM org.students s
         JOIN org.batches b ON b.id = s.batch_id
         WHERE s.user_id = $1 LIMIT 1`,
        [userId]
      );

      if (studentRows.length === 0) {
        sendSuccess(res, { drills: [] });
        return;
      }

      const { subdivision_id, batch_id, program_id } = studentRows[0];

      const { rows } = await db.query(
        `SELECT
           da.id,
           da.title,
           da.session_type,
           da.target_scope,
           da.domain_or_topic,
           da.difficulty,
           da.due_date,
           da.is_mandatory,
           da.custom_instructions,
           da.created_at,
           u.name AS created_by_name
         FROM org.drill_assignments da
         JOIN identity.users u ON u.id = da.created_by
         WHERE da.is_active = true
           AND (
             (da.target_scope = 'SUBDIVISION'      AND da.subdivision_id = $1)
             OR (da.target_scope = 'PROGRAM'        AND da.program_id     = $2)
             OR (da.target_scope = 'SPECIFIC_STUDENT' AND da.target_user_id = $3)
             OR  da.target_scope = 'ALL_STUDENTS'
           )
         ORDER BY da.due_date ASC, da.created_at DESC`,
        [subdivision_id ?? null, program_id ?? null, userId]
      );

      sendSuccess(res, { drills: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);
