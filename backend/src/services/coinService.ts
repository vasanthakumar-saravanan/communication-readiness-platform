/**
 * Server-authoritative session coins backed by the existing credit ledger.
 *
 * 1 coin = the GLOBAL credit policy consume_amount (10 by default).
 * Session start consumes one coin. Fair completion restores the spent coin
 * plus one bonus coin, capped at MAX_COINS. Abandon/disqualification keeps
 * the spent coin consumed.
 */
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { CreditService } from '../modules/credits/credits.service';

export const MAX_COINS = 5;
const COMPLETION_REWARD_COINS = 2;
const SPEND_REASON = 'SESSION_START';
const REWARD_REASON = 'SESSION_COMPLETED';

async function coinPrice(): Promise<number> {
  const { rows } = await db.query<{ consume_amount: string }>(
    `SELECT consume_amount FROM credit.credit_policies
     WHERE scope_type = 'GLOBAL' AND is_active = TRUE
     ORDER BY created_at ASC LIMIT 1`
  );
  const price = Number(rows[0]?.consume_amount);
  return price > 0 ? price : 10;
}

const toCoins = (balance: number, price: number) => Math.max(0, Math.floor(balance / price));

async function balanceOf(studentId: string): Promise<number> {
  await CreditService.createAccount(studentId);
  const { rows } = await db.query<{ balance: string }>(
    'SELECT balance FROM credit.credit_accounts WHERE student_id = $1',
    [studentId]
  );
  return Number(rows[0]?.balance ?? 0);
}

export async function getCoins(studentId: string): Promise<{ coins: number; maxCoins: number }> {
  const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]);
  return { coins: Math.min(MAX_COINS, toCoins(balance, price)), maxCoins: MAX_COINS };
}

export async function spendCoin(studentId: string, reference: string): Promise<number> {
  const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]);
  if (balance < price) {
    throw new AppError(402, 'You have no coins left. Coins are restored by your administrator.', 'INSUFFICIENT_COINS');
  }
  const { newBalance } = await CreditService.consume(studentId, price, SPEND_REASON, reference);
  return Math.min(MAX_COINS, toCoins(newBalance, price));
}

export async function rewardCompletion(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice();
  const { rows } = await db.query(
    `SELECT 1 FROM credit.credit_transactions
     WHERE student_id = $1
       AND reference_id::text = $2
       AND transaction_type = 'CONSUME'
       AND reference_type = $3
     LIMIT 1`,
    [studentId, reference, SPEND_REASON]
  );
  if (rows.length === 0) return getCoins(studentId).then(r => r.coins);

  const { newBalance } = await CreditService.earn(
    studentId,
    price * COMPLETION_REWARD_COINS,
    REWARD_REASON,
    reference,
  );
  return Math.min(MAX_COINS, toCoins(newBalance, price));
}

export async function refundCoin(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice();
  const { newBalance } = await CreditService.earn(
    studentId,
    price,
    'SESSION_REFUND',
    reference,
  );
  return Math.min(MAX_COINS, toCoins(newBalance, price));
}

export async function setCoins(studentId: string, coins: number, actorUserId: string): Promise<number> {
  const target = Math.max(0, Math.min(MAX_COINS, Math.round(coins)));
  const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]);
  const delta = target * price - balance;
  if (delta === 0) return target;

  const reference = actorUserId;
  const reason = `ADMIN_SET_COINS:${Date.now()}`;
  const result = delta > 0
    ? await CreditService.earn(studentId, delta, reason, reference)
    : await CreditService.consume(studentId, -delta, reason, reference);
  return Math.min(MAX_COINS, toCoins(result.newBalance, price));
}
