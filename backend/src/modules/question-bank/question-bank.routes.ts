import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

export const questionBankRouter = Router();

const createSchema = z.object({
  questionText: z.string().min(1),
  difficulty: z.enum(['EASY', 'MEDIUM', 'ADVANCED']),
  evaluationCriteria: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
  skillIds: z.array(z.string().uuid()).optional(),
  isPrimary: z.boolean().optional().default(false),
});

const updateSchema = z.object({
  questionText: z.string().min(1).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'ADVANCED']).optional(),
  evaluationCriteria: z.record(z.unknown()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const BANK_READER_ROLES = ['FACULTY_MENTOR', 'TRAINER', 'PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'] as const;

// GET /api/question-bank
questionBankRouter.get(
  '/',
  authenticate,
  requireRole(...BANK_READER_ROLES),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rows } = await db.query(
        `SELECT q.id, q.question_text, q.difficulty, q.evaluation_criteria,
                q.metadata, q.is_active, q.created_at,
                COALESCE(json_agg(qs.skill_id) FILTER (WHERE qs.skill_id IS NOT NULL), '[]') AS skill_ids
         FROM session.question_bank_items q
         LEFT JOIN session.question_bank_item_skills qs ON qs.question_bank_item_id = q.id
         WHERE q.is_active = true
         GROUP BY q.id
         ORDER BY q.created_at DESC`
      );
      sendSuccess(res, { questions: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/question-bank
questionBankRouter.post(
  '/',
  authenticate,
  requireRole('FACULTY_MENTOR', 'TRAINER', 'PROGRAM_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { questionText, difficulty, evaluationCriteria, metadata, skillIds, isPrimary } = parsed.data;

      const client = await (db as any).connect();
      try {
        await client.query('BEGIN');

        const { rows } = await client.query(
          `INSERT INTO session.question_bank_items
             (question_text, difficulty, evaluation_criteria, metadata)
           VALUES ($1, $2, $3, $4)
           RETURNING id, question_text, difficulty, evaluation_criteria, metadata, is_active, created_at`,
          [questionText, difficulty, evaluationCriteria ? JSON.stringify(evaluationCriteria) : null,
           metadata ? JSON.stringify(metadata) : null]
        );
        const item = rows[0];

        if (skillIds && skillIds.length > 0) {
          for (const skillId of skillIds) {
            await client.query(
              `INSERT INTO session.question_bank_item_skills (question_bank_item_id, skill_id, is_primary)
               VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
              [item.id, skillId, isPrimary ?? false]
            );
          }
        }

        await client.query('COMMIT');
        sendSuccess(res, { question: item }, 201);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/question-bank/:id
questionBankRouter.put(
  '/:id',
  authenticate,
  requireRole('FACULTY_MENTOR', 'TRAINER', 'PROGRAM_ADMIN'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');

      const { rows: existing } = await db.query(
        'SELECT id FROM session.question_bank_items WHERE id = $1 AND is_active = true',
        [id]
      );
      if (existing.length === 0) throw new AppError(404, 'Question not found', 'NOT_FOUND');

      const sets: string[] = ['updated_at = now()'];
      const vals: unknown[] = [id];
      let idx = 2;
      const { questionText, difficulty, evaluationCriteria, metadata } = parsed.data;

      if (questionText !== undefined)      { sets.push(`question_text = $${idx++}`);        vals.push(questionText); }
      if (difficulty !== undefined)        { sets.push(`difficulty = $${idx++}`);           vals.push(difficulty); }
      if (evaluationCriteria !== undefined){ sets.push(`evaluation_criteria = $${idx++}`);  vals.push(JSON.stringify(evaluationCriteria)); }
      if (metadata !== undefined)          { sets.push(`metadata = $${idx++}`);             vals.push(JSON.stringify(metadata)); }

      const { rows } = await db.query(
        `UPDATE session.question_bank_items SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, question_text, difficulty, evaluation_criteria, metadata, is_active, updated_at`,
        vals
      );
      sendSuccess(res, { question: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// DELETE /api/question-bank/:id — soft delete
questionBankRouter.delete(
  '/:id',
  authenticate,
  requireRole('PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { rows } = await db.query(
        `UPDATE session.question_bank_items SET is_active = false, updated_at = now()
         WHERE id = $1 AND is_active = true
         RETURNING id`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Question not found', 'NOT_FOUND');
      sendSuccess(res, { message: 'Question deactivated' });
    } catch (err) {
      sendError(res, err);
    }
  }
);
