/**
 * In-process brute-force guard for POST /api/auth/login.
 * Counts failed attempts per (client IP, email); after MAX_FAILURES within the
 * window the pair is locked until the window expires. A successful login clears it.
 * Single-process only — move to Redis when the backend runs more than one instance.
 */
const MAX_FAILURES = 10;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map<string, { count: number; resetAt: number }>();

const keyFor = (ip: string, email: string) => `${ip}|${email}`;

export function lockedForSeconds(ip: string, email: string): number {
  const entry = failures.get(keyFor(ip, email));
  if (!entry) return 0;
  const now = Date.now();
  if (entry.resetAt <= now) {
    failures.delete(keyFor(ip, email));
    return 0;
  }
  return entry.count >= MAX_FAILURES ? Math.ceil((entry.resetAt - now) / 1000) : 0;
}

export function recordFailure(ip: string, email: string): void {
  const key = keyFor(ip, email);
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(ip: string, email: string): void {
  failures.delete(keyFor(ip, email));
}

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failures) {
    if (entry.resetAt <= now) failures.delete(key);
  }
}, WINDOW_MS).unref();
