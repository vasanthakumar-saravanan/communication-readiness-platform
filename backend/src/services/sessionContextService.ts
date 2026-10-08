import { createClient } from 'redis';
import { db } from '../shared/db/pool';
import { env } from '../config/env';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TurnContext {
  turn: number;
  question: string;
  answer: string;
  summary: string; // context_summary from LLM — stored in Redis + pgvector
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  ts: string;
}

export interface InterviewState {
  session_id: string;
  student_id: string;
  topic_curriculum: string[];
  completed_topics: string[];
  active_topic: string;
  active_topic_question_count: number;
  max_questions_per_topic: number;
  do_not_ask_or_repeat: string[];
  current_turn: number;
  max_turns: number;
  current_difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  candidate_performance_trend: 'improving' | 'stable' | 'declining';
  consecutive_weak_answers: number;
  // Current question + rubric (updated in-state after each LLM call)
  current_question: string;
  current_question_turn: number;
  current_rubric: Record<string, unknown>;
  // Rolling overall score — server-tracked, never from client
  rolling_overall_score?: number;
  rolling_score_turns?: number;
}

// ── Redis connection (lazy singleton) ─────────────────────────────────────────

type NodeRedisClient = ReturnType<typeof createClient>;

let _redis: NodeRedisClient | null = null;
let _connectPromise: Promise<unknown> | null = null;

async function getRedis(): Promise<NodeRedisClient> {
  // If no REDIS_URL configured, fail immediately — don't block on localhost:6379 retries
  if (!env.REDIS_URL) {
    throw new Error('REDIS_URL not configured');
  }

  if (_redis && _redis.isOpen) return _redis;

  if (!_redis) {
    _redis = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 3000,
        reconnectStrategy: (retries: number) => {
          if (retries >= 3) return new Error('Redis retry limit exceeded');
          return Math.min(retries * 500, 2000);
        },
      },
    });

    _redis.on('error', (err: Error) => {
      console.error('[SessionContext] Redis error:', err.message);
    });
  }

  if (!_connectPromise) {
    _connectPromise = _redis.connect().catch((err: Error) => {
      console.error('[SessionContext] Redis connect failed:', err.message);
      _connectPromise = null;
      _redis = null;
      throw err;
    });
  }

  await _connectPromise;
  return _redis;
}

// ── Session Context Service ───────────────────────────────────────────────────

export class SessionContextService {
  private readonly SESSION_TTL_SECONDS = 7200; // 2 hours

  private contextKey(sessionId: string): string {
    return `session:${sessionId}:context`;
  }

  private stateKey(sessionId: string): string {
    return `session:${sessionId}:state`;
  }

  private resumeKey(sessionId: string): string {
    return `session:${sessionId}:resume`;
  }

  // ── Turn context (short-term list) ────────────────────────────────────────

  async appendTurn(sessionId: string, turn: TurnContext): Promise<void> {
    try {
      const redis = await getRedis();
      const k = this.contextKey(sessionId);
      await redis.rPush(k, JSON.stringify(turn));
      await redis.expire(k, this.SESSION_TTL_SECONDS);
    } catch (err) {
      console.error('[SessionContext] appendTurn failed (Redis unavailable):', (err as Error).message);
    }
  }

  async getTurns(sessionId: string, lastN = 10): Promise<TurnContext[]> {
    try {
      const redis = await getRedis();
      const items = await redis.lRange(this.contextKey(sessionId), -lastN, -1);
      return items.map((raw) => JSON.parse(raw) as TurnContext);
    } catch (err) {
      console.error('[SessionContext] getTurns error:', err);
      return [];
    }
  }

  async getSummaries(sessionId: string, lastN = 10): Promise<string[]> {
    const turns = await this.getTurns(sessionId, lastN);
    return turns.map((t) => t.summary).filter(Boolean);
  }

  async flushToDb(sessionId: string, studentId: string): Promise<void> {
    let items: string[];
    try {
      const redis = await getRedis();
      items = await redis.lRange(this.contextKey(sessionId), 0, -1);
    } catch (err) {
      console.error('[SessionContext] Redis lrange error during flush:', err);
      return;
    }

    if (items.length === 0) return;

    const turns = items.map((raw) => JSON.parse(raw) as TurnContext);

    // Live schema uses (transcript_text, metadata jsonb) — no separate question/answer/difficulty cols
    const values = turns
      .map((_, i) => `($1, $2, $${i * 3 + 3}, $${i * 3 + 4}, $${i * 3 + 5})`)
      .join(', ');

    const params: (string | number | object)[] = [sessionId, studentId];
    for (const t of turns) {
      params.push(
        t.turn,
        t.answer, // transcript_text
        JSON.stringify({ question_text: t.question, difficulty: t.difficulty, answer: t.answer }),
      );
    }

    try {
      await db.query(
        `INSERT INTO session.interview_transcripts
           (session_id, student_id, turn_number, transcript_text, metadata)
         VALUES ${values}
         ON CONFLICT ON CONSTRAINT uq_transcripts_session_turn DO NOTHING`,
        params,
      );
    } catch (err) {
      console.error('[SessionContext] DB flush error:', err);
    }
  }

  async clearContext(sessionId: string): Promise<void> {
    try {
      const redis = await getRedis();
      await redis.del(this.contextKey(sessionId));
    } catch (err) {
      console.error('[SessionContext] clearContext error:', err);
    }
  }

  // ── Interview state ───────────────────────────────────────────────────────

  async getState(sessionId: string): Promise<InterviewState | null> {
    try {
      const redis = await getRedis();
      const raw = await redis.get(this.stateKey(sessionId));
      return raw ? (JSON.parse(raw) as InterviewState) : null;
    } catch (err) {
      console.error('[SessionContext] getState error:', err);
      return null;
    }
  }

  async setState(sessionId: string, state: InterviewState): Promise<void> {
    try {
      const redis = await getRedis();
      await redis.set(this.stateKey(sessionId), JSON.stringify(state), {
        EX: this.SESSION_TTL_SECONDS,
      });
    } catch (err) {
      console.error('[SessionContext] setState error:', err);
    }
  }

  async updateState(
    sessionId: string,
    patch: {
      mark_topic_completed?: string | null;
      add_to_do_not_ask?: string | null;
      next_recommended_difficulty?: string;
      increment_turn?: boolean;
      increment_topic_question_count?: boolean;
      current_question?: string;
      current_question_turn?: number;
      current_rubric?: Record<string, unknown>;
      performance_trend?: InterviewState['candidate_performance_trend'];
      overall_score?: number;
    },
  ): Promise<InterviewState | null> {
    const state = await this.getState(sessionId);
    if (!state) return null;

    if (patch.mark_topic_completed) {
      if (!state.completed_topics.includes(patch.mark_topic_completed)) {
        state.completed_topics.push(patch.mark_topic_completed);
      }
      const next = state.topic_curriculum.find((t) => !state.completed_topics.includes(t));
      if (next) {
        state.active_topic = next;
        state.active_topic_question_count = 0;
      }
    }

    if (patch.add_to_do_not_ask) {
      if (!state.do_not_ask_or_repeat.includes(patch.add_to_do_not_ask)) {
        state.do_not_ask_or_repeat.push(patch.add_to_do_not_ask);
      }
      // Cap at 15 — prevent LLM prompt bloat
      if (state.do_not_ask_or_repeat.length > 15) {
        state.do_not_ask_or_repeat = state.do_not_ask_or_repeat.slice(-15);
      }
    }

    if (patch.next_recommended_difficulty) {
      state.current_difficulty = patch.next_recommended_difficulty as InterviewState['current_difficulty'];
    }
    if (patch.increment_turn) state.current_turn += 1;
    if (patch.increment_topic_question_count) state.active_topic_question_count += 1;
    if (patch.current_question !== undefined) state.current_question = patch.current_question;
    if (patch.current_question_turn !== undefined) state.current_question_turn = patch.current_question_turn;
    if (patch.current_rubric !== undefined) state.current_rubric = patch.current_rubric;
    if (patch.performance_trend) state.candidate_performance_trend = patch.performance_trend;
    if (patch.overall_score !== undefined) {
      const prevScore = state.rolling_overall_score ?? 0;
      const prevCount = state.rolling_score_turns ?? 0;
      const newCount = prevCount + 1;
      state.rolling_overall_score = Math.round((prevScore * prevCount + patch.overall_score) / newCount);
      state.rolling_score_turns = newCount;
    }

    await this.setState(sessionId, state);
    return state;
  }

  // ── Checkpoint: write interview_state to DB (locked, throttled) ───────────

  async checkpointToDb(sessionId: string): Promise<void> {
    const lockKey = `session:${sessionId}:db_lock`;
    let redis: NodeRedisClient;
    try {
      redis = await getRedis();
    } catch {
      console.error('[SessionContext] checkpointToDb: Redis unavailable, skipping checkpoint');
      return;
    }

    const acquired = await redis.set(lockKey, '1', { NX: true, EX: 10 }).catch(() => null);
    if (!acquired) return; // another write in flight — next checkpoint catches up

    try {
      const state = await this.getState(sessionId);
      if (!state) return;
      // session.assessment_sessions is the active session table; state_data holds interview state
      await db.query(
        `UPDATE session.assessment_sessions
         SET state_data = $1, updated_at = now()
         WHERE id = $2`,
        [JSON.stringify(state), sessionId],
      );
    } catch (err) {
      console.error('[SessionContext] checkpointToDb error:', err);
    } finally {
      await redis.del(lockKey).catch(() => {});
    }
  }

  // ── Resume ────────────────────────────────────────────────────────────────

  async getResume(sessionId: string): Promise<Record<string, unknown> | null> {
    try {
      const redis = await getRedis();
      const raw = await redis.get(this.resumeKey(sessionId));
      return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    } catch (err) {
      console.error('[SessionContext] getResume error:', err);
      return null;
    }
  }

  async setResume(sessionId: string, resume: Record<string, unknown>): Promise<void> {
    try {
      const redis = await getRedis();
      await redis.set(this.resumeKey(sessionId), JSON.stringify(resume), {
        EX: this.SESSION_TTL_SECONDS,
      });
    } catch (err) {
      console.error('[SessionContext] setResume error:', err);
    }
  }
}

export const sessionContextService = new SessionContextService();
