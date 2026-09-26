import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { CreditService } from './credits.service';

export const creditsRouter = Router();

// GET /api/credits/balance/:studentId
creditsRouter.get(
  '/balance/:studentId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const role = req.user!.role;
      const userId = req.user!.id;

      // Students can only see their own balance
      if (role === 'STUDENT') {
        const { rows } = await db.query(
          'SELECT id FROM org.students WHERE id = $1 AND user_id = $2',
          [studentId, userId]
        );
        if (rows.length === 0) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      const { rows } = await db.query(
        'SELECT id, balance, created_at, updated_at FROM credit.credit_accounts WHERE student_id = $1',
        [studentId]
      );
      if (rows.length === 0) throw new AppError(404, 'Credit account not found', 'NOT_FOUND');

      sendSuccess(res, {
        studentId,
        balance: Number(rows[0].balance),
        accountId: rows[0].id,
        updatedAt: rows[0].updated_at,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/credits/transactions/:studentId
creditsRouter.get(
  '/transactions/:studentId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { studentId } = req.params;
      const role = req.user!.role;
      const userId = req.user!.id;

      if (role === 'STUDENT') {
        const { rows } = await db.query(
          'SELECT id FROM org.students WHERE id = $1 AND user_id = $2',
          [studentId, userId]
        );
        if (rows.length === 0) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }

      const page  = Math.max(1, parseInt(req.query.page as string  || '1', 10));
      const limit = Math.min(100, parseInt(req.query.limit as string || '20', 10));
      const offset = (page - 1) * limit;

      const { rows } = await db.query(
        `SELECT id, transaction_type, amount, balance_after, reference_type, reference_id,
                metadata, created_at
         FROM credit.credit_transactions
         WHERE student_id = $1
         ORDER BY created_at DESC
         LIMIT $2 OFFSET $3`,
        [studentId, limit, offset]
      );

      const { rows: countRows } = await db.query(
        'SELECT COUNT(*) AS total FROM credit.credit_transactions WHERE student_id = $1',
        [studentId]
      );

      sendSuccess(res, {
        transactions: rows,
        pagination: { total: parseInt(countRows[0].total, 10), page, limit },
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/credits/adjust — admin manual adjustment
const adjustSchema = z.object({
  studentId:  z.string().uuid(),
  amount:     z.number(),
  reason:     z.string().min(1).max(200),
  referenceId: z.string().uuid().optional(),
});

creditsRouter.post(
  '/adjust',
  authenticate,
  requireRole('PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = adjustSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { studentId, amount, reason, referenceId } = parsed.data;
      const refId = referenceId ?? req.user!.id;

      if (amount > 0) {
        const result = await CreditService.earn(studentId, amount, `ADJUST:${reason}`, refId);
        sendSuccess(res, { newBalance: result.newBalance, transactionId: result.transactionId });
      } else if (amount < 0) {
        const result = await CreditService.consume(studentId, Math.abs(amount), `ADJUST:${reason}`, refId);
        sendSuccess(res, { newBalance: result.newBalance, transactionId: result.transactionId });
      } else {
        throw new AppError(422, 'Amount cannot be zero', 'VALIDATION_ERROR');
      }
    } catch (err) {
      sendError(res, err);
    }
  }
);
