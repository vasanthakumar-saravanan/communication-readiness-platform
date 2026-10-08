import { Router, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { getCoins, spendCoin, rewardCompletion, setCoins, MAX_COINS } from '../services/coinService';

export const coinsRouter = Router();

async function ownStudentId(req: AuthRequest): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'SELECT id FROM org.students WHERE user_id = $1',
    [req.user!.id],
  );
  if (rows.length === 0) throw new AppError(404, 'Student profile not found', 'NOT_FOUND');
  return rows[0].id;
}

coinsRouter.get('/me', requireRole('STUDENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    sendSuccess(res, await getCoins(await ownStudentId(req)));
  } catch (err) {
    sendError(res, err);
  }
});

const spendSchema = z.object({ purpose: z.enum(['LISTENING_COMPREHENSION']) });

coinsRouter.post('/me/spend', requireRole('STUDENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!spendSchema.safeParse(req.body).success) {
      throw new AppError(422, 'Unknown session type', 'VALIDATION_ERROR');
    }
    const sessionRef = randomUUID();
    const coins = await spendCoin(await ownStudentId(req), sessionRef);
    sendSuccess(res, { sessionRef, coins, maxCoins: MAX_COINS }, 201);
  } catch (err) {
    sendError(res, err);
  }
});

const completeSchema = z.object({ sessionRef: z.string().uuid() });

coinsRouter.post('/me/complete', requireRole('STUDENT'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = completeSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'sessionRef is required', 'VALIDATION_ERROR');
    const coins = await rewardCompletion(await ownStudentId(req), parsed.data.sessionRef);
    sendSuccess(res, { coins, maxCoins: MAX_COINS });
  } catch (err) {
    sendError(res, err);
  }
});

const restoreSchema = z.object({ coins: z.number().int().min(0).max(MAX_COINS).default(MAX_COINS) });

coinsRouter.post(
  '/:studentId/restore',
  requireRole('PLATFORM_OWNER', 'SUPER_ADMIN', 'COLLEGE_ADMIN', 'PROGRAM_ADMIN', 'PLACEMENT_COORDINATOR'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const studentId = req.params.studentId as string;
      const parsed = restoreSchema.safeParse(req.body ?? {});
      if (!parsed.success) throw new AppError(422, `coins must be 0-${MAX_COINS}`, 'VALIDATION_ERROR');

      const { rows } = await db.query<{ student_institution: string | null; caller_institution: string | null }>(
        `SELECT su.institution_id AS student_institution,
                (SELECT institution_id FROM identity.users WHERE id = $2) AS caller_institution
         FROM org.students s
         JOIN identity.users su ON su.id = s.user_id
         WHERE s.id::text = $1`,
        [studentId, req.user!.id],
      );
      const row = rows[0];
      if (!row || (req.user!.role !== 'PLATFORM_OWNER' && row.student_institution !== row.caller_institution)) {
        throw new AppError(404, 'Student not found', 'NOT_FOUND');
      }

      const coins = await setCoins(studentId, parsed.data.coins, req.user!.id);
      sendSuccess(res, { studentId, coins, maxCoins: MAX_COINS });
    } catch (err) {
      sendError(res, err);
    }
  },
);
