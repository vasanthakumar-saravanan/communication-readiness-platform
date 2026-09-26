import { eventBus } from '../../shared/events/eventBus';
import { Events, UserRegisteredPayload, AttemptCompletedPayload } from '../../shared/events/events';
import { CreditService } from './credits.service';
import { EligibilityService } from '../placement/eligibility.service';

export function registerM4EventHandlers(): void {
  // USER_REGISTERED → create credit account with initial balance from global policy
  eventBus.on(Events.USER_REGISTERED, async (payload: UserRegisteredPayload) => {
    if (!payload.studentId) return;
    try {
      await CreditService.createAccount(payload.studentId);
    } catch (err) {
      console.error('[M4] USER_REGISTERED handler error:', (err as Error).message);
    }
  });

  // ATTEMPT_COMPLETED → earn credits + recalculate placement eligibility
  eventBus.on(Events.ATTEMPT_COMPLETED, async (payload: AttemptCompletedPayload) => {
    if (!payload.studentId) return;
    try {
      // Fetch earn amount from global policy
      const { db } = await import('../../shared/db/pool');
      const { rows: policies } = await db.query(
        `SELECT consume_amount FROM credit.credit_policies
         WHERE scope_type = 'GLOBAL' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1`
      );
      const earnAmount = policies.length > 0 ? Number(policies[0].consume_amount) : 10;

      await CreditService.earn(
        payload.studentId,
        earnAmount,
        'ATTEMPT_COMPLETED',
        payload.attemptId
      );
    } catch (err) {
      console.error('[M4] ATTEMPT_COMPLETED credit earn error:', (err as Error).message);
    }

    try {
      await EligibilityService.recalculate(payload.studentId);
    } catch (err) {
      console.error('[M4] ATTEMPT_COMPLETED eligibility recalculate error:', (err as Error).message);
    }
  });
}
