import { Router, Response } from 'express';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';

export const performanceRouter = Router();

// ── Scope guard ────────────────────────────────────────────────────────────────
// STUDENT: own studentId only.
// FACULTY_MENTOR: must have an active assignment to the target student.
// PROGRAM_ADMIN / TRAINER / PLACEMENT_COORDINATOR: any student.

async function assertScope(req: AuthRequest, studentId: string): Promise<void> {
  const user = req.user!;
  const staffRoles = ['PROGRAM_ADMIN', 'TRAINER', 'PLACEMENT_COORDINATOR'];

  if (staffRoles.includes(user.role)) return;

  if (user.role === 'STUDENT') {
    const { rows } = await db.query(
      'SELECT id FROM org.students WHERE id = $1 AND user_id = $2',
      [studentId, user.id]
    );
    if (rows.length === 0) throw new AppError(403, 'Access denied', 'FORBIDDEN');
    return;
  }

  if (user.role === 'FACULTY_MENTOR') {
    const { rows } = await db.query(
      `SELECT id FROM org.student_mentor_assignments
       WHERE student_id = $1 AND mentor_id = $2 AND is_active = true`,
      [studentId, user.id]
    );
    if (rows.length === 0) throw new AppError(403, 'Not assigned to this student', 'FORBIDDEN');
    return;
  }

  throw new AppError(403, 'Access denied', 'FORBIDDEN');
}

// ── GET /api/performance/:studentId ───────────────────────────────────────────

performanceRouter.get('/:studentId', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertScope(req, studentId);
    const { rows } = await db.query(
      `SELECT id, student_id, technical_score, communication_score, listening_score,
              overall_score, previous_overall_score, trend, updated_at
       FROM performance.performance_profiles
       WHERE student_id = $1`,
      [req.params.studentId]
    );
    if (rows.length === 0) throw new AppError(404, 'Performance profile not found', 'NOT_FOUND');
    sendSuccess(res, { profile: rows[0] });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/performance/:studentId/history ────────────────────────────────────

performanceRouter.get('/:studentId/history', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertScope(req, studentId);
    const limit  = Math.min(parseInt(req.query.limit  as string || '20', 10), 100);
    const offset = parseInt(req.query.offset as string || '0',  10);

    const { rows } = await db.query(
      `SELECT id, attempt_id, program_id, batch_id, subdivision_id,
              technical_score, communication_score, listening_score, overall_score,
              component_scores, skill_scores, captured_at
       FROM performance.performance_snapshots
       WHERE student_id = $1
       ORDER BY captured_at DESC
       LIMIT $2 OFFSET $3`,
      [studentId, limit, offset]
    );

    const { rows: countRows } = await db.query(
      'SELECT COUNT(*) AS total FROM performance.performance_snapshots WHERE student_id = $1',
      [studentId]
    );

    sendSuccess(res, { snapshots: rows, total: parseInt(countRows[0].total, 10) });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/performance/:studentId/skills ─────────────────────────────────────
// Returns per-skill latest score and all historical records.

performanceRouter.get('/:studentId/skills', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const studentId = req.params.studentId as string;
    await assertScope(req, studentId);

    // Most recent score per skill
    const { rows } = await db.query(
      `SELECT sp.skill_id, sk.name AS skill_name, sk.category,
              sp.score, sp.proficiency_level, sp.source, sp.measured_at
       FROM performance.skill_performances sp
       JOIN performance.skills sk ON sk.id = sp.skill_id
       WHERE sp.student_id = $1
       ORDER BY sk.category, sk.name, sp.measured_at DESC`,
      [studentId]
    );

    // Group by skill, keep latest + history
    const bySkill: Record<string, {
      skill_id: string; skill_name: string; category: string;
      latest_score: number | null; proficiency_level: string | null;
      history: { score: number; measured_at: string }[];
    }> = {};

    for (const r of rows) {
      if (!bySkill[r.skill_id]) {
        bySkill[r.skill_id] = {
          skill_id: r.skill_id, skill_name: r.skill_name, category: r.category,
          latest_score: r.score, proficiency_level: r.proficiency_level, history: [],
        };
      }
      bySkill[r.skill_id].history.push({ score: r.score, measured_at: r.measured_at });
    }

    sendSuccess(res, { skills: Object.values(bySkill) });
  } catch (err) {
    sendError(res, err);
  }
});
