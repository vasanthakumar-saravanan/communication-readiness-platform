import { env } from '../config/env';

interface CachedTurn {
  turnNumber: number;
  transcript: string;
  timestamp: string;
}

class SessionContextService {
  private redis: {
    lpush: (key: string, value: string) => Promise<unknown>;
    ltrim: (key: string, start: number, stop: number) => Promise<unknown>;
    expire: (key: string, seconds: number) => Promise<unknown>;
    lrange: (key: string, start: number, stop: number) => Promise<string[]>;
  } | null = null;

  private readonly TTL_SECONDS = 7200; // 2 hours
  private readonly MAX_CACHED_TURNS = 10;

  constructor() {
    if (!env.REDIS_URL) {
      console.info('[SessionContextService] REDIS_URL not set — turn caching disabled');
      return;
    }
    try {
      // Dynamic require so the server starts even if ioredis is not installed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Redis = require('ioredis');
      const client = new Redis(env.REDIS_URL, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      client.on('error', (err: Error) => {
        console.warn('[SessionContextService] Redis error:', err.message);
      });
      this.redis = client;
    } catch {
      console.warn('[SessionContextService] ioredis unavailable — turn caching disabled');
    }
  }

  async cacheTurn(sessionId: string, turn: CachedTurn): Promise<void> {
    if (!this.redis) return;
    try {
      const key = `session:${sessionId}:turns`;
      await this.redis.lpush(key, JSON.stringify(turn));
      await this.redis.ltrim(key, 0, this.MAX_CACHED_TURNS - 1);
      await this.redis.expire(key, this.TTL_SECONDS);
    } catch {
      // Non-fatal — Redis unavailable, continue without caching
    }
  }

  async getCachedTurns(sessionId: string): Promise<CachedTurn[]> {
    if (!this.redis) return [];
    try {
      const key = `session:${sessionId}:turns`;
      const items = await this.redis.lrange(key, 0, -1);
      return items.map((s) => JSON.parse(s) as CachedTurn);
    } catch {
      return [];
    }
  }
}

export const sessionContextService = new SessionContextService();
