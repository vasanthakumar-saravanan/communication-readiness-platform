/*
Setup

Two validation schemas (createSchema, updateSchema) using Zod — they check that incoming data has the right shape before touching the database. E.g. name must be a non-empty string under 255 chars.

GET /api/assessments

Anyone logged in can call this.
Runs a SQL query to fetch all assessments where is_active = true, newest first.
Returns the list.

POST /api/assessments

Only PROGRAM_ADMIN or PLACEMENT_COORDINATOR can call this.
Validates the request body against createSchema — rejects with 422 if invalid.
Inserts a new row into assessment.assessments.
Returns the newly created assessment with status 201 (created).

GET /api/assessments/:id

Anyone logged in can call this.
Fetches one assessment by ID, and also joins in its "components" (sub-parts, like question sections) using json_agg.
If no components exist, returns an empty array [] instead of null.
If the assessment doesn't exist, throws a 404.

PUT /api/assessments/:id

Only PROGRAM_ADMIN or PLACEMENT_COORDINATOR can call this.
Validates body against updateSchema (all fields optional — partial update).
Checks the assessment exists first (404 if not).
Dynamically builds the UPDATE query — only touches fields that were actually sent in the request (this is why it loops and pushes to sets/vals conditionally).
Always updates updated_at to now.
Returns the updated row.
*/
import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

export const assessmentsRouter = Router();

const createSchema = z.object({
  name: z.string().min(1).max(255),
  assessmentType: z.enum(['MOCK_INTERVIEW', 'LISTENING_COMPREHENSION']),
  interviewType: z.string().max(50).optional(),
  description: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  interviewType: z.string().max(50).nullish(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

// GET /api/assessments
assessmentsRouter.get(
  '/',
  authenticate,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rows } = await db.query(
        `SELECT id, name, assessment_type, interview_type, version, description, is_active, created_at
         FROM assessment.assessments
         WHERE is_active = true
         ORDER BY created_at DESC`
      );
      sendSuccess(res, { assessments: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/assessments
assessmentsRouter.post(
  '/',
  authenticate,
  requireRole('PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { name, assessmentType, interviewType, description } = parsed.data;

      const { rows } = await db.query(
        `INSERT INTO assessment.assessments (name, assessment_type, interview_type, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, assessment_type, interview_type, version, description, is_active, created_at`,
        [name, assessmentType, interviewType ?? null, description ?? null]
      );
      sendSuccess(res, { assessment: rows[0] }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/assessments/:id
assessmentsRouter.get(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { rows } = await db.query(
        `SELECT a.id, a.name, a.assessment_type, a.interview_type, a.version,
                a.description, a.is_active, a.created_at,
                COALESCE(json_agg(ac ORDER BY ac.component_type) FILTER (WHERE ac.id IS NOT NULL), '[]') AS components
         FROM assessment.assessments a
         LEFT JOIN assessment.assessment_components ac ON ac.assessment_id = a.id AND ac.is_active = true
         WHERE a.id = $1
         GROUP BY a.id`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');
      sendSuccess(res, { assessment: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/assessments/:id
assessmentsRouter.put(
  '/:id',
  authenticate,
  requireRole('PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { name, interviewType, description, isActive } = parsed.data;

      const { rows: existing } = await db.query(
        'SELECT id FROM assessment.assessments WHERE id = $1',
        [id]
      );
      if (existing.length === 0) throw new AppError(404, 'Assessment not found', 'NOT_FOUND');

      const sets: string[] = ['updated_at = now()'];
      const vals: unknown[] = [id];
      let idx = 2;

      if (name !== undefined)         { sets.push(`name = $${idx++}`);          vals.push(name); }
      if (interviewType !== undefined) { sets.push(`interview_type = $${idx++}`); vals.push(interviewType); }
      if (description !== undefined)  { sets.push(`description = $${idx++}`);   vals.push(description); }
      if (isActive !== undefined)     { sets.push(`is_active = $${idx++}`);     vals.push(isActive); }

      const { rows } = await db.query(
        `UPDATE assessment.assessments SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, name, assessment_type, interview_type, version, description, is_active, updated_at`,
        vals
      );
      sendSuccess(res, { assessment: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);
