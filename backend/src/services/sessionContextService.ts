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
  technical_score?: number; // 0-100, from the turn evaluation
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
  // Rolling scores — server-tracked, never from client
  rolling_overall_score?: number;
  rolling_technical_score?: number;
  rolling_communication_score?: number;
  rolling_score_turns?: number;
  // Live interview bookkeeping
  status?: 'ACTIVE' | 'COMPLETED' | 'TERMINATED';
  resume?: InterviewResume;
  attempt_id?: string;
  current_category?: string;
  // Rubric for the current question: what a strong answer covers
  current_key_points?: string[];
  turn_results?: TurnResult[];
  clarifications_this_turn?: number;
  consecutive_ai_failures?: number;
  tab_switches?: number;
  fullscreen_exits?: number;
  last_proctor_event_at?: number;
}

// What the interviewer knows about the candidate, used to ground questions in their resume.
export interface InterviewResume {
  name: string;
  skills: string[];
  projects: { title: string; tech_stack: string[]; description: string }[];
}

// One evaluated answer. Scores are 0-100; wpm is null when speaking time was not measured.
export interface TurnResult {
  turn: number;
  question: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  category: string;
  answer: string;
  technicalScore: number;
  llmTechnicalScore: number;      // the evaluator's judgement before key-point coverage is blended in
  keyPoints: string[];
  pointsCovered: string[];
  pointsMissed: string[];
  fluencyScore: number;
  clarityScore: number;
  communicationScore: number;
  overallScore: number;
  wpm: number | null;
  paceLabel: string | null;
  paceScore: number | null;
  fillerScore: number | null;
  pauseCount: number | null;        // silences of PAUSE_THRESHOLD_SEC+ while answering
  longestPauseSec: number | null;
  responseLatencySec: number | null; // question asked → first words
  fillerCount: number;
  fillerBreakdown: Record<string, number>;
  feedback: string;
  strengths: string;
  weaknesses: string;
  ts: string;
}

// ── Key-value store: Redis, or in-process memory when REDIS_URL is unset ─────

// The subset of Redis commands this service uses.
interface KvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<unknown>;
  del(key: string): Promise<unknown>;
  rPush(key: string, value: string): Promise<unknown>;
  lRange(key: string, start: number, stop: number): Promise<string[]>;
  expire(key: string, seconds: number): Promise<unknown>;
}

// Single-process fallback so interviews work in development without Redis.
// Without it, node-redis retries the connection forever and every call hangs.
class MemoryKvStore implements KvStore {
  private entries = new Map<string, { value: string | string[]; expiresAt?: number }>();

  private read(key: string): string | string[] | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== undefined && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  async get(key: string): Promise<string | null> {
    const value = this.read(key);
    return typeof value === 'string' ? value : null;
  }

  async set(key: string, value: string, options?: { EX?: number; NX?: boolean }): Promise<string | null> {
    if (options?.NX && this.read(key) !== undefined) return null;
    const expiresAt = options?.EX ? Date.now() + options.EX * 1000 : undefined;
    this.entries.set(key, { value, expiresAt });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.entries.delete(key) ? 1 : 0;
  }

  async rPush(key: string, value: string): Promise<number> {
    const list = this.read(key);
    const next = Array.isArray(list) ? [...list, value] : [value];
    this.entries.set(key, { value: next, expiresAt: this.entries.get(key)?.expiresAt });
    return next.length;
  }

  async lRange(key: string, start: number, stop: number): Promise<string[]> {
    const list = this.read(key);
    if (!Array.isArray(list)) return [];
    const len = list.length;
    const from = start < 0 ? Math.max(0, len + start) : start;
    const to = stop < 0 ? len + stop : Math.min(stop, len - 1);
    return to < from ? [] : list.slice(from, to + 1);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const entry = this.entries.get(key);
    if (!entry) return 0;
    entry.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }
}

const memoryStore = new MemoryKvStore();
let memoryStoreWarned = false;

type NodeRedisClient = ReturnType<typeof createClient>;

let _redis: NodeRedisClient | null = null;
let _connectPromise: Promise<unknown> | null = null;

async function getRedis(): Promise<KvStore> {
  if (!env.REDIS_URL) {
    if (!memoryStoreWarned) {
      memoryStoreWarned = true;
      console.warn('[SessionContext] REDIS_URL not set — using in-memory session store (single process only)');
    }
    return memoryStore;
  }

  if (_redis && _redis.isOpen) return _redis as unknown as KvStore;

  if (!_redis) {
    _redis = createClient({
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
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
  return _redis as unknown as KvStore;
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

    const values = turns
      .map((_, i) => `($1, $2, $${i * 4 + 3}, $${i * 4 + 4}, $${i * 4 + 5}, $${i * 4 + 6})`)
      .join(', ');

    const params: (string | number)[] = [sessionId, studentId];
    for (const t of turns) {
      params.push(t.turn, t.question, t.answer, t.difficulty);
    }

    try {
      await db.query(
        `INSERT INTO session.interview_transcripts
           (session_id, student_id, turn_number, question, answer, difficulty)
         VALUES ${values}
         ON CONFLICT (session_id, turn_number) DO NOTHING`,
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

  // Falls back to the copy in session.interview_sessions, so an interview survives a
  // backend restart (in-memory store) or an expired Redis key.
  async getState(sessionId: string): Promise<InterviewState | null> {
    try {
      const redis = await getRedis();
      const raw = await redis.get(this.stateKey(sessionId));
      if (raw) return JSON.parse(raw) as InterviewState;
    } catch (err) {
      console.error('[SessionContext] getState error:', err);
    }
    try {
      const { rows } = await db.query<{ interview_state: InterviewState }>(
        'SELECT interview_state FROM session.interview_sessions WHERE id::text = $1',
        [sessionId]
      );
      const state = rows[0]?.interview_state;
      if (!state?.session_id) return null;
      const redis = await getRedis();
      await redis.set(this.stateKey(sessionId), JSON.stringify(state), { EX: this.SESSION_TTL_SECONDS });
      return state;
    } catch (err) {
      console.error('[SessionContext] getState DB fallback error:', err);
      return null;
    }
  }

  // Write-through: the cache serves reads, the DB row keeps the interview recoverable.
  async setState(sessionId: string, state: InterviewState): Promise<void> {
    try {
      const redis = await getRedis();
      await redis.set(this.stateKey(sessionId), JSON.stringify(state), {
        EX: this.SESSION_TTL_SECONDS,
      });
    } catch (err) {
      console.error('[SessionContext] setState error:', err);
    }
    try {
      await db.query(
        'UPDATE session.interview_sessions SET interview_state = $1, updated_at = now() WHERE id::text = $2',
        [JSON.stringify(state), sessionId]
      );
    } catch (err) {
      console.error('[SessionContext] setState DB write error:', err);
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
      technical_score?: number;
      communication_score?: number;
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
      const prevCount = state.rolling_score_turns ?? 0;
      const newCount = prevCount + 1;
      const rolling = (prev: number | undefined, next: number | undefined) =>
        next === undefined ? prev : Math.round(((prev ?? 0) * prevCount + next) / newCount);
      state.rolling_overall_score = rolling(state.rolling_overall_score, patch.overall_score);
      state.rolling_technical_score = rolling(state.rolling_technical_score, patch.technical_score);
      state.rolling_communication_score = rolling(state.rolling_communication_score, patch.communication_score);
      state.rolling_score_turns = newCount;
    }

    await this.setState(sessionId, state);
    return state;
  }

  // ── Checkpoint: write interview_state to DB (locked, throttled) ───────────

  async checkpointToDb(sessionId: string): Promise<void> {
    const lockKey = `session:${sessionId}:db_lock`;
    let redis: KvStore;
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
      await db.query(
        `UPDATE session.interview_sessions
         SET interview_state = $1, updated_at = now()
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
