/** In-process brute-force guard for login. Use Redis for multi-instance deployments. */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();
const keyFor = (ip: string, email: string) => ip + '|' + email;
export function lockedForSeconds(ip: string, email: string): number {
  const key = keyFor(ip, email); const entry = failures.get(key); if (!entry) return 0;
  const now = Date.now(); if (entry.resetAt <= now) { failures.delete(key); return 0; }
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}
export function recordFailure(ip: string, email: string): void {
  const key = keyFor(ip, email); const now = Date.now(); const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) failures.set(key, { count: 1, resetAt: now + WINDOW_MS }); else entry.count += 1;
}
export function clearFailures(ip: string, email: string): void { failures.delete(keyFor(ip, email)); }
setInterval(() => { const now = Date.now(); for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key); }, WINDOW_MS).unref();
