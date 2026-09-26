import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';

export const creditPoliciesRouter = Router();

// GET /api/credit-policies
creditPoliciesRouter.get(
  '/',
  authenticate,
  requireRole('PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'),
  async (_req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { rows } = await db.query(
        `SELECT id, policy_key, scope_type, initial_credit_amount, consume_amount,
                reward_ceiling, max_balance, self_practice_enabled, is_active, created_at
         FROM credit.credit_policies ORDER BY created_at ASC`
      );
      sendSuccess(res, { policies: rows });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const policySchema = z.object({
  policyKey:              z.string().max(100).optional(),
  scopeType:              z.enum(['GLOBAL', 'PROGRAM', 'SUBDIVISION', 'STUDENT']).default('GLOBAL'),
  institutionId:          z.string().uuid().optional(),
  programId:              z.string().uuid().optional(),
  subdivisionId:          z.string().uuid().optional(),
  studentId:              z.string().uuid().optional(),
  initialCreditAmount:    z.number().min(0).default(50),
  consumeAmount:          z.number().min(0).default(10),
  rewardCeiling:          z.number().min(0).default(200),
  maxBalance:             z.number().min(0).optional(),
  selfPracticeEnabled:    z.boolean().default(true),
  conductedAttemptPolicy: z.record(z.unknown()).optional(),
});

// POST /api/credit-policies
creditPoliciesRouter.post(
  '/',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = policySchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const d = parsed.data;
      const { rows } = await db.query(
        `INSERT INTO credit.credit_policies
           (policy_key, scope_type, institution_id, program_id, subdivision_id, student_id,
            initial_credit_amount, consume_amount, reward_ceiling, max_balance,
            self_practice_enabled, conducted_attempt_policy, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,TRUE)
         RETURNING id, policy_key, scope_type, initial_credit_amount, consume_amount,
                   reward_ceiling, max_balance, is_active`,
        [d.policyKey ?? null, d.scopeType, d.institutionId ?? null, d.programId ?? null,
         d.subdivisionId ?? null, d.studentId ?? null, d.initialCreditAmount, d.consumeAmount,
         d.rewardCeiling, d.maxBalance ?? null, d.selfPracticeEnabled,
         d.conductedAttemptPolicy ? JSON.stringify(d.conductedAttemptPolicy) : null]
      );
      res.status(201);
      sendSuccess(res, { policy: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// PUT /api/credit-policies/:id
creditPoliciesRouter.put(
  '/:id',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const parsed = policySchema.partial().safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const d = parsed.data;

      const { rows } = await db.query(
        `UPDATE credit.credit_policies SET
           initial_credit_amount = COALESCE($1, initial_credit_amount),
           consume_amount        = COALESCE($2, consume_amount),
           reward_ceiling        = COALESCE($3, reward_ceiling),
           max_balance           = COALESCE($4, max_balance),
           is_active             = COALESCE($5, is_active),
           updated_at            = now()
         WHERE id = $6
         RETURNING id, policy_key, scope_type, initial_credit_amount, consume_amount, reward_ceiling`,
        [d.initialCreditAmount ?? null, d.consumeAmount ?? null, d.rewardCeiling ?? null,
         d.maxBalance ?? null, (d as Record<string, unknown>).isActive ?? null, id]
      );
      if (rows.length === 0) throw new AppError(404, 'Policy not found', 'NOT_FOUND');
      sendSuccess(res, { policy: rows[0] });
    } catch (err) {
      sendError(res, err);
    }
  }
);
