/**
 * Live interview WebSocket gateway — ws(s)://<host>/ws/interview?sessionId=<uuid>&token=<jwt>
 *
 * Browser → server:
 *   { type: 'audio_start', metadata: { domain? } }        start of an answer
 *   <binary>                                               MediaRecorder audio chunks
 *   { type: 'audio_end', transcript?, durationSec?, pauseCount?, longestPauseSec?, responseLatencySec? }
 *   { type: 'finish', ...same fields }                    time is up / end now
 *   { type: 'proctor_event', event: 'TAB_SWITCH' | 'FULLSCREEN_EXIT' }
 * Server → browser:
 *   ready, transcript_interim, status, clarification, turn_result (report on the
 *   last turn), interview_complete, proctor_warning, terminated, error
 *
 * Speech-to-text: Deepgram when DEEPGRAM_API_KEY is set (server transcribes the
 * audio stream); otherwise the browser transcribes and sends `transcript` with
 * audio_end. The question, difficulty and turn number always come from the
 * server-side interview state, never from the client.
 */

import http from 'http';
import { Duplex } from 'stream';
import { WebSocketServer, WebSocket, RawData } from 'ws';
import { env } from '../config/env';
import jwt from 'jsonwebtoken';
import { AppError } from '../shared/errors/AppError';
import { db } from '../shared/db/pool';
import { wsManager } from './wsManager';
import * as deepgramService from './deepgramService';
import type { AudioStartMeta } from './deepgramService';
import { triggerLLMEvaluation, finishInterview, recordProctorEvent, DeliveryMetrics } from './llmEvaluationService';
import { sessionContextService } from './sessionContextService';
import { loadOwnedSession, OwnedSession } from './interviewSessionService';

const PATH_RE = /^\/ws\/interview\/?$/;
const MAX_TRANSCRIPT_CHARS = 5000;
const MAX_BUFFERED_AUDIO_BYTES = 5 * 1024 * 1024;
const MAX_PENDING_MESSAGES = 200;
// After audio_end, give Deepgram a moment to deliver its last final result
const DEEPGRAM_FLUSH_MS = 750;
const KEEPALIVE_MS = 25_000;

interface Turn {
  meta: AudioStartMeta | null;
  ready: Promise<void>;
  done: boolean;
  // Audio received before the Deepgram stream is open (the first chunk carries the WebM header)
  bufferedAudio: Buffer[];
  bufferedBytes: number;
  streamOpen: boolean;
}

function toBuffer(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data;
  if (Array.isArray(data)) return Buffer.concat(data);
  return Buffer.from(data);
}

// Application close codes (4000-4999); the reason is shown to the student.
function closeFor(err: unknown): { code: number; reason: string } {
  if (err instanceof AppError) {
    const codes: Record<number, number> = { 401: 4401, 403: 4403, 404: 4404, 409: 4409 };
    if (codes[err.statusCode]) return { code: codes[err.statusCode], reason: err.message.slice(0, 120) };
  }
  console.error('[interviewGateway] connection error:', err);
  return { code: 1011, reason: 'Interview service error' };
}

async function authorize(token: string | null, sessionId: string): Promise<OwnedSession> {
  if (!token) throw new AppError(401, 'Missing access token', 'UNAUTHENTICATED');

  let decoded: any;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as any;
    const { rows } = await db.query<{ token_version: number; status: string }>(
      'SELECT token_version, status FROM identity.users WHERE id = $1',
      [decoded.id],
    );
    if (!rows.length || rows[0].status === 'SUSPENDED' || rows[0].token_version !== decoded.tokenVersion) {
      throw new Error('invalid token');
    }
  } catch {
    throw new AppError(401, 'Invalid or expired token', 'UNAUTHENTICATED');
  }

  if (decoded.role !== 'STUDENT') {
    throw new AppError(403, 'Only students can join an interview', 'FORBIDDEN');
  }
  return loadOwnedSession(sessionId, decoded.id);
}

function handleConnection(ws: WebSocket, sessionId: string, token: string | null): void {
  const useDeepgram = Boolean(env.DEEPGRAM_API_KEY);
  let session: OwnedSession | null = null;
  let turn: Turn | null = null;
  const pending: Array<[RawData, boolean]> = [];

  const emitError = (message: string) => wsManager.emit(sessionId, { type: 'error', message });

  const finishTurn = async (
    current: Turn,
    transcript: string,
    options: DeliveryMetrics & { isFinal?: boolean } = {},
  ): Promise<void> => {
    if (current.done || !current.meta || !session) return;
    current.done = true;
    if (useDeepgram) deepgramService.closeSession(sessionId);

    try {
      await triggerLLMEvaluation(sessionId, transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS), current.meta, options);
    } catch (err) {
      console.error('[interviewGateway] evaluation error:', err);
      emitError('Could not evaluate your answer. Please answer the question again.');
    }
  };

  const startTurn = (message: Record<string, unknown>): void => {
    const clientMeta = (message.metadata ?? message) as Record<string, unknown>;
    if (useDeepgram) deepgramService.closeSession(sessionId);

    const current: Turn = {
      meta: null,
      ready: Promise.resolve(),
      done: false,
      bufferedAudio: [],
      bufferedBytes: 0,
      streamOpen: false,
    };
    turn = current;

    current.ready = (async () => {
      const state = await sessionContextService.getState(sessionId);
      if (!state) {
        current.done = true;
        emitError('This interview session has ended or expired. Please start a new interview.');
        return;
      }

      if (!state.current_question) {
        const bootstrapQuestion =
          typeof clientMeta.question_text === 'string' ? clientMeta.question_text.trim().slice(0, 500) : '';
        const bootstrapDifficulty =
          clientMeta.difficulty === 'MEDIUM' || clientMeta.difficulty === 'ADVANCED' ? clientMeta.difficulty : 'EASY';
        state.current_question = bootstrapQuestion || 'Tell me about yourself. Walk me through your background and the key skills you have built.';
        state.current_difficulty = bootstrapDifficulty as any;
        state.current_question_turn = state.current_turn || 1;
        state.current_category = 'Introduction';
        state.do_not_ask_or_repeat = [state.current_question];
        await sessionContextService.setState(sessionId, state);
      }

      current.meta = {
        questionText: state.current_question,
        difficulty: state.current_difficulty,
        turnNumber: state.current_turn,
        studentId: session!.studentId,
        domain: typeof clientMeta.domain === 'string' ? clientMeta.domain.slice(0, 100) : undefined,
      };

      if (useDeepgram) {
        await deepgramService.openSession(sessionId, current.meta, (transcript) => finishTurn(current, transcript));
        current.streamOpen = true;
        for (const chunk of current.bufferedAudio) deepgramService.sendAudio(sessionId, chunk);
        current.bufferedAudio = [];
      }
    })().catch((err) => {
      console.error('[interviewGateway] audio_start error:', err);
      current.done = true;
      emitError('Could not start listening. Please try again.');
    });
  };

  const endTurn = async (message: Record<string, unknown>, isFinal = false): Promise<void> => {
    const current = turn;
    if (!current) {
      if (isFinal) await finishInterview(sessionId);
      return;
    }
    await current.ready;
    if (current.done) {
      if (isFinal) await finishInterview(sessionId);
      return;
    }

    let serverTranscript = '';
    if (useDeepgram) {
      await new Promise((resolve) => setTimeout(resolve, DEEPGRAM_FLUSH_MS));
      if (current.done) { if (isFinal) await finishInterview(sessionId); return; }
      serverTranscript = deepgramService.closeSession(sessionId);
    }
    const clientTranscript = typeof message.transcript === 'string' ? message.transcript : '';
    // Delivery measured by the browser: speaking time (→ WPM), long pauses, response latency
    const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
    await finishTurn(current, serverTranscript || clientTranscript, {
      durationSec: num(message.durationSec),
      pauseCount: num(message.pauseCount),
      longestPauseSec: num(message.longestPauseSec),
      responseLatencySec: num(message.responseLatencySec),
      isFinal,
    });
  };

  const onMessage = (data: RawData, isBinary: boolean): void => {
    if (isBinary) {
      const current = turn;
      if (!useDeepgram || !current || current.done) return;
      const chunk = toBuffer(data);
      if (current.streamOpen) {
        deepgramService.sendAudio(sessionId, chunk);
      } else if (current.bufferedBytes + chunk.length <= MAX_BUFFERED_AUDIO_BYTES) {
        current.bufferedAudio.push(chunk);
        current.bufferedBytes += chunk.length;
      }
      return;
    }

    let message: Record<string, unknown>;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (message.type === 'audio_start') {
      startTurn(message);
    } else if (message.type === 'audio_end') {
      endTurn(message).catch((err) => console.error('[interviewGateway] audio_end error:', err));
    } else if (message.type === 'finish') {
      endTurn(message, true).catch((err) => console.error('[interviewGateway] finish error:', err));
    } else if (message.type === 'proctor_event') {
      const event = message.event === 'FULLSCREEN_EXIT' ? 'FULLSCREEN_EXIT' : 'TAB_SWITCH';
      recordProctorEvent(sessionId, event).catch((err) => console.error('[interviewGateway] proctor error:', err));
    }
  };

  // Messages can arrive while auth is still running — queue them until then.
  ws.on('message', (data: RawData, isBinary: boolean) => {
    if (session) {
      onMessage(data, isBinary);
    } else if (pending.length < MAX_PENDING_MESSAGES) {
      pending.push([data, isBinary]);
    }
  });

  // Proxies (nginx: proxy_read_timeout, 60 s by default) drop idle sockets, and with
  // browser speech recognition nothing is sent while the candidate thinks. Ping keeps it open.
  const keepAlive = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, KEEPALIVE_MS);

  ws.on('close', () => {
    clearInterval(keepAlive);
    if (wsManager.get(sessionId) === ws && useDeepgram) deepgramService.closeSession(sessionId);
    wsManager.unregister(sessionId, ws);
  });

  authorize(token, sessionId)
    .then(async (owned) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      session = owned;

      // Main repo historically creates the session before the first question endpoint runs.
      // Bootstrap server state once from that first question; every later turn is server-owned.
      let state = await sessionContextService.getState(sessionId);
      if (!state) {
        const { rows } = await db.query<{ name: string; parsed_resume: any }>(
          `SELECT u.name, s.parsed_resume
           FROM org.students s
           JOIN identity.users u ON u.id = s.user_id
           WHERE s.id = $1`,
          [owned.studentId],
        );
        const parsedResume = rows[0]?.parsed_resume ?? {};
        const skills = [
          ...(parsedResume?.skills?.languages ?? []),
          ...(parsedResume?.skills?.frameworks ?? []),
        ].filter((v: unknown): v is string => typeof v === 'string').slice(0, 20);
        const projects = (parsedResume?.projects ?? []).slice(0, 5).map((p: any) => ({
          title: String(p?.title ?? '').slice(0, 120),
          tech_stack: Array.isArray(p?.techStack) ? p.techStack.filter((v: unknown): v is string => typeof v === 'string').slice(0, 10) : [],
          description: String(p?.description ?? '').slice(0, 400),
        }));

        state = {
          session_id: sessionId,
          student_id: owned.studentId,
          topic_curriculum: skills.length ? skills.slice(0, 5) : ['General Programming'],
          completed_topics: [],
          active_topic: skills[0] || 'General Programming',
          active_topic_question_count: 0,
          max_questions_per_topic: 3,
          do_not_ask_or_repeat: [],
          current_turn: 1,
          max_turns: env.MAX_QUESTIONS_PER_SESSION,
          current_difficulty: 'EASY',
          candidate_performance_trend: 'stable',
          consecutive_weak_answers: 0,
          current_question: '',
          current_question_turn: 1,
          current_rubric: {},
          status: 'ACTIVE',
          attempt_id: owned.attemptId,
          resume: { name: rows[0]?.name ?? 'Candidate', skills, projects },
          current_category: 'Introduction',
          current_key_points: [],
          turn_results: [],
          clarifications_this_turn: 0,
          consecutive_ai_failures: 0,
          tab_switches: 0,
          fullscreen_exits: 0,
        };
        await sessionContextService.setState(sessionId, state);
      }
      const previous = wsManager.get(sessionId);
      if (previous && previous !== ws) previous.close(4000, 'Interview opened in another window');
      wsManager.register(sessionId, ws);
      // On a reconnect the browser resyncs to the server's current question
      const state = await sessionContextService.getState(sessionId);
      ws.send(JSON.stringify({
        type: 'ready',
        stt: useDeepgram ? 'deepgram' : 'client',
        turnNumber: state?.current_turn ?? 1,
        totalTurns: state?.max_turns ?? null,
        questionText: state?.current_question ?? '',
        difficulty: state?.current_difficulty ?? 'EASY',
      }));
      console.log(`[interviewGateway] connected session=${sessionId} stt=${useDeepgram ? 'deepgram' : 'client'}`);
      for (const [data, isBinary] of pending.splice(0)) onMessage(data, isBinary);
    })
    .catch((err) => {
      const { code, reason } = closeFor(err);
      ws.close(code, reason);
    });
}

export function createInterviewWsServer(server: http.Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 2 * 1024 * 1024 });

  server.on('upgrade', (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!PATH_RE.test(url.pathname)) {
      socket.destroy();
      return;
    }
    const sessionId = url.searchParams.get('sessionId');
    if (!sessionId) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, sessionId, url.searchParams.get('token'));
    });
  });

  return wss;
}
