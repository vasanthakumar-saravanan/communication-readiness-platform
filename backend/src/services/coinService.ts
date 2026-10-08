/** Server-authoritative interview coin wallet backed by credit.credit_* tables. */
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { CreditService } from '../modules/credits/credits.service';
export const MAX_COINS = 5;
const COMPLETION_REWARD_COINS = 2;
async function coinPrice(): Promise<number> {
  const { rows } = await db.query<{ consume_amount: string }>(
    'SELECT consume_amount FROM credit.credit_policies WHERE scope_type = \'GLOBAL\' AND is_active = TRUE ORDER BY created_at ASC LIMIT 1'
  );
  const price = Number(rows[0]?.consume_amount); return price > 0 ? price : 10;
}
const toCoins = (balance: number, price: number) => Math.min(MAX_COINS, Math.max(0, Math.floor(balance / price)));
async function balanceOf(studentId: string): Promise<number> {
  await CreditService.createAccount(studentId);
  const { rows } = await db.query<{ balance: string }>('SELECT balance FROM credit.credit_accounts WHERE student_id = $1', [studentId]);
  return Number(rows[0]?.balance ?? 0);
}
export async function getCoins(studentId: string) { const [balance, price] = await Promise.all([balanceOf(studentId), coinPrice()]); return { coins: toCoins(balance, price), maxCoins: MAX_COINS }; }
export async function spendCoin(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice(); if ((await balanceOf(studentId)) < price) throw new AppError(402, 'You have no coins left. Coins are restored by your administrator.', 'INSUFFICIENT_COINS');
  const { newBalance } = await CreditService.consume(studentId, price, 'SESSION_START', reference); return toCoins(newBalance, price);
}
export async function rewardCompletion(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice();
  const { rows } = await db.query('SELECT 1 FROM credit.credit_transactions WHERE student_id=$1 AND reference_id::text=$2 AND transaction_type=\'CONSUME\' AND reference_type=\'SESSION_START\' LIMIT 1', [studentId, reference]);
  if (!rows.length) return toCoins(await balanceOf(studentId), price);
  const { newBalance } = await CreditService.earn(studentId, price * COMPLETION_REWARD_COINS, 'SESSION_COMPLETED', reference); return toCoins(newBalance, price);
}
export async function refundCoin(studentId: string, reference: string): Promise<number> {
  const price = await coinPrice(); const { newBalance } = await CreditService.earn(studentId, price, 'SESSION_REFUND', reference); return toCoins(newBalance, price);
}
