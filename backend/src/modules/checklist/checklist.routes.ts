import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { eventBus } from '../../shared/events/eventBus';
import { Events } from '../../shared/events/events';

export const checklistRouter = Router();

// GET /api/checklist — list all items (any authenticated user)
checklistRouter.get(
  '/',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const programId = req.query.programId as string | undefined;
      const { rows } = await db.query(
        `SELECT id, program_id, subdivision_id, name, description, category,
                max_score, weight, is_required, is_active, created_at
         FROM placement.checklist_items
         WHERE ($1::uuid IS NULL OR program_id = $1)
         ORDER BY is_required DESC, name ASC`,
        [programId ?? null]
      );
      sendSuccess(res, { items: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const itemSchema = z.object({
  programId:     z.string().uuid(),
  subdivisionId: z.string().uuid().optional(),
  name:          z.string().min(1).max(255),
  description:   z.string().optional(),
  category:      z.string().max(100).optional(),
  maxScore:      z.number().min(0).optional(),
  weight:        z.number().min(0).max(1).optional(),
  isRequired:    z.boolean().default(true),
});

// POST /api/checklist
checklistRouter.post(
  '/',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = itemSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const d = parsed.data;
      const { rows } = await db.query(
        `INSERT INTO placement.checklist_items
           (program_id, subdivision_id, name, description, category, max_score, weight, is_required, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,TRUE)
         RETURNING id, name, is_required, is_active`,
        [d.programId, d.subdivisionId ?? null, d.name, d.description ?? null,
         d.category ?? null, d.maxScore ?? null, d.weight ?? null, d.isRequired]
      );
      res.status(201);
      sendSuccess(res, { item: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/checklist/import-csv
checklistRouter.post(
  '/import-csv',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // Expects JSON body: { programId, rows: [{ name, description?, category?, isRequired? }] }
      const schema = z.object({
        programId:    z.string().uuid(),
        subdivisionId: z.string().uuid().optional(),
        rows: z.array(z.object({
          name:        z.string().min(1),
          description: z.string().optional(),
          category:    z.string().optional(),
          isRequired:  z.boolean().default(true),
        })).min(1),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { programId, subdivisionId, rows } = parsed.data;

      let inserted = 0;
      for (const row of rows) {
        await db.query(
          `INSERT INTO placement.checklist_items
             (program_id, subdivision_id, name, description, category, is_required, is_active)
           VALUES ($1,$2,$3,$4,$5,$6,TRUE)
           ON CONFLICT (program_id, name) DO NOTHING`,
          [programId, subdivisionId ?? null, row.name, row.description ?? null,
           row.category ?? null, row.isRequired]
        ).then(r => { if (r.rowCount && r.rowCount > 0) inserted++; });
      }
      sendSuccess(res, { inserted, total: rows.length });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/checklist/:id
checklistRouter.put(
  '/:id',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parsed = itemSchema.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const d = parsed.data;
      const { rows } = await db.query(
        `UPDATE placement.checklist_items SET
           name        = COALESCE($1, name),
           description = COALESCE($2, description),
           category    = COALESCE($3, category),
           max_score   = COALESCE($4, max_score),
           weight      = COALESCE($5, weight),
           is_required = COALESCE($6, is_required),
           updated_at  = now()
         WHERE id = $7 AND is_active = TRUE
         RETURNING id, name, is_required`,
        [d.name ?? null, d.description ?? null, d.category ?? null,
         d.maxScore ?? null, d.weight ?? null, d.isRequired ?? null, id]
      );
      if (rows.length === 0) throw new AppError(404, 'Checklist item not found', 'NOT_FOUND');
      sendSuccess(res, { item: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// DELETE /api/checklist/:id — soft delete
checklistRouter.delete(
  '/:id',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { rows } = await db.query(
        `UPDATE placement.checklist_items SET is_active = FALSE, updated_at = now()
         WHERE id = $1 RETURNING id`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Checklist item not found', 'NOT_FOUND');
      res.status(204).end();
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/checklist/my-progress — student's own checklist + progress
checklistRouter.get(
  '/my-progress',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { rows: students } = await db.query(
        'SELECT id, batch_id FROM org.students WHERE user_id = $1',
        [userId]
      );
      if (students.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');
      const { id: studentId, batch_id } = students[0];

      // Get program from batch
      const { rows: batches } = await db.query(
        'SELECT program_id FROM org.batches WHERE id = $1',
        [batch_id]
      );
      const programId = batches.length > 0 ? batches[0].program_id : null;

      const { rows } = await db.query(
        `SELECT ci.id, ci.name, ci.description, ci.category, ci.max_score, ci.is_required,
                cp.status, cp.score, cp.completion_evidence, cp.is_mentor_verified, cp.completed_at
         FROM placement.checklist_items ci
         LEFT JOIN placement.checklist_progress cp
           ON cp.checklist_item_id = ci.id AND cp.student_id = $1
         WHERE ci.is_active = TRUE AND ($2::uuid IS NULL OR ci.program_id = $2)
         ORDER BY ci.is_required DESC, ci.name ASC`,
        [studentId, programId]
      );
      sendSuccess(res, { studentId, items: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/checklist/:itemId/toggle — student marks item complete/incomplete
const toggleSchema = z.object({
  status:             z.enum(['PENDING', 'IN_PROGRESS', 'COMPLETED']).default('COMPLETED'),
  completionEvidence: z.string().max(1000).optional(),
  score:              z.number().min(0).optional(),
});

checklistRouter.post(
  '/:itemId/toggle',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { itemId } = req.params;
      const userId = req.user!.id;

      const { rows: students } = await db.query(
        'SELECT id FROM org.students WHERE user_id = $1',
        [userId]
      );
      if (students.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');
      const studentId = students[0].id as string;

      const parsed = toggleSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { status, completionEvidence, score } = parsed.data;

      const completedAt = status === 'COMPLETED' ? 'now()' : 'NULL';

      const { rows } = await db.query(
        `INSERT INTO placement.checklist_progress
           (student_id, checklist_item_id, status, completion_evidence, score, completed_at)
         VALUES ($1, $2, $3, $4, $5, ${completedAt})
         ON CONFLICT (student_id, checklist_item_id) DO UPDATE SET
           status             = EXCLUDED.status,
           completion_evidence = EXCLUDED.completion_evidence,
           score              = EXCLUDED.score,
           completed_at       = ${completedAt === 'NULL' ? 'NULL' : 'EXCLUDED.completed_at'},
           is_mentor_verified = CASE WHEN EXCLUDED.status != 'COMPLETED' THEN FALSE
                                     ELSE checklist_progress.is_mentor_verified END,
           updated_at         = now()
         RETURNING id, status, is_mentor_verified`,
        [studentId, itemId, status, completionEvidence ?? null, score ?? null]
      );

      // Fire event for notification (mentor to review)
      eventBus.emit(Events.CHECKLIST_ITEM_TOGGLED, {
        studentId,
        itemId,
        isCompleted: status === 'COMPLETED',
        toggledBy: studentId,
      });

      sendSuccess(res, { progress: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/checklist/mentee/:studentId — mentor views mentee checklist
checklistRouter.get(
  '/mentee/:studentId',
  authenticate,
  requireRole('FACULTY_MENTOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const userId = req.user!.id;

      // Verify mentor is assigned to this student
      const { rows: assignments } = await db.query(
        `SELECT id FROM org.student_mentor_assignments
         WHERE student_id = $1 AND mentor_id = $2 AND is_active = TRUE`,
        [studentId, userId]
      );
      if (assignments.length === 0) throw new AppError(403, 'Not assigned to this student', 'FORBIDDEN');

      const { rows } = await db.query(
        `SELECT ci.id, ci.name, ci.description, ci.category, ci.max_score, ci.is_required,
                cp.status, cp.score, cp.completion_evidence, cp.is_mentor_verified, cp.completed_at
         FROM placement.checklist_items ci
         LEFT JOIN placement.checklist_progress cp
           ON cp.checklist_item_id = ci.id AND cp.student_id = $1
         WHERE ci.is_active = TRUE
         ORDER BY ci.is_required DESC, ci.name ASC`,
        [studentId]
      );
      sendSuccess(res, { studentId, items: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);
