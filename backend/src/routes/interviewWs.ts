/**
 * WebSocket interview endpoint: /ws/interview?token=<jwt>&sessionId=<uuid>
 *
 * Auth:    JWT in query param (WS upgrades cannot send Authorization header)
 * Session: verified against assessment.assessment_attempts so only the owning
 *          student can connect (STUDENT role enforced; staff/mentor may observe)
 *
 * Binary frames → Deepgram streaming STT
 * JSON frames   → control messages (start_interview, audio_end, submit_transcript)
 */

import { IncomingMessage } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { db } from '../shared/db/pool';
import { wsManager } from '../services/wsManager';
import { sessionContextService } from '../services/sessionContextService';
import * as deepgramService from '../services/deepgramService';
import { triggerLLMEvaluation } from '../services/llmEvaluationService';
import type { JWTPayload } from '../shared/types/auth';

// ── JWT verification (no middleware chain for WS) ─────────────────────────────

async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as JWTPayload;
    const { rows } = await db.query<{ token_version: number; status: string }>(
      'SELECT token_version, status FROM identity.users WHERE id = $1',
      [decoded.id],
    );
    if (rows.length === 0) return null;
    if (rows[0].status === 'SUSPENDED') return null;
    if (rows[0].token_version !== decoded.tokenVersion) return null;
    return decoded;
  } catch {
    return null;
  }
}

// ── Session ownership check ───────────────────────────────────────────────────

async function verifySessionOwnership(
  sessionId: string,
  userId: string,
  role: string,
): Promise<{ studentId: string } | null> {
  // Staff / mentor roles may observe any session
  if (role !== 'STUDENT') {
    const { rows } = await db.query(
      `SELECT aa.student_id
       FROM session.assessment_sessions ss
       JOIN assessment.assessment_attempts aa ON aa.id = ss.attempt_id
       WHERE ss.id = $1`,
      [sessionId],
    );
    if (rows.length === 0) return null;
    return { studentId: rows[0].student_id };
  }

  // STUDENT may only connect to their own session
  const { rows } = await db.query(
    `SELECT aa.student_id
     FROM session.assessment_sessions ss
     JOIN assessment.assessment_attempts aa ON aa.id = ss.attempt_id
     JOIN org.students s ON s.id = aa.student_id
     WHERE ss.id = $1 AND s.user_id = $2`,
    [sessionId, userId],
  );
  if (rows.length === 0) return null;
  return { studentId: rows[0].student_id };
}

// ── Resume loader ─────────────────────────────────────────────────────────────

async function loadResumeIntoContext(
  sessionId: string,
  studentId: string,
): Promise<void> {
  // Check if already cached in Redis
  const existing = await sessionContextService.getResume(sessionId);
  if (existing && Object.keys(existing).length > 0) return;

  const { rows } = await db.query(
    'SELECT parsed_resume FROM org.students WHERE id = $1',
    [studentId],
  );
  const resume = rows[0]?.parsed_resume ?? {};
  if (resume && Object.keys(resume).length > 0) {
    await sessionContextService.setResume(sessionId, resume);
  }
}

// ── Topic curriculum builder (uses beginner resume skills) ───────────────────

async function buildTopicCurriculum(studentId: string): Promise<string[]> {
  try {
    const { rows } = await db.query(
      'SELECT parsed_resume FROM org.students WHERE id = $1',
      [studentId],
    );
    const resume = rows[0]?.parsed_resume;
    if (!resume) return ['General Programming'];

    const topics: string[] = [];
    const langs: string[] = resume.skills?.languages ?? [];
    const fundamentals: string[] = resume.skills?.fundamentals ?? [];
    const cs: string[] = resume.skills?.cs_fundamentals ?? [];

    // Primary language topics (up to 3)
    for (const lang of langs.slice(0, 3)) {
      topics.push(lang);
    }
    // CS fundamentals as grouped topics
    if (cs.some((s: string) => s.toLowerCase().includes('dbms') || s.toLowerCase().includes('sql'))) {
      topics.push('DBMS & SQL');
    }
    if (cs.some((s: string) => s.toLowerCase().includes('network'))) {
      topics.push('Computer Networks');
    }
    if (cs.some((s: string) => s.toLowerCase().includes('operating'))) {
      topics.push('Operating Systems');
    }
    if (fundamentals.length > 0) {
      topics.push('Programming Fundamentals');
    }
    return topics.length > 0 ? topics : ['General Programming'];
  } catch {
    return ['General Programming'];
  }
}

// ── Active Deepgram turn tracker ──────────────────────────────────────────────

interface ActiveTurn {
  questionText: string;
  difficulty: 'EASY' | 'MEDIUM' | 'ADVANCED';
  turnNumber: number;
  domain?: string;
}

const activeTurns = new Map<string, ActiveTurn>();

// ── WS connection handler ─────────────────────────────────────────────────────

async function handleConnection(ws: WebSocket, req: IncomingMessage): Promise<void> {
  const url = new URL(req.url ?? '/', `http://localhost`);
  const token = url.searchParams.get('token');
  const sessionId = url.searchParams.get('sessionId');

  const reject = (msg: string) => {
    try {
      ws.send(JSON.stringify({ type: 'error', message: msg }));
    } catch {}
    ws.close(4001, msg);
  };

  if (!token || !sessionId) {
    reject('token and sessionId are required');
    return;
  }

  const user = await verifyToken(token);
  if (!user) {
    reject('Authentication failed');
    return;
  }

  const ownership = await verifySessionOwnership(sessionId, user.id, user.role);
  if (!ownership) {
    reject('Session not found or access denied');
    return;
  }

  const { studentId } = ownership;

  // Register the WS for server→client pushes
  wsManager.register(sessionId, ws);

  ws.send(JSON.stringify({ type: 'connected', sessionId }));
  console.log(`[WS] connected  sessionId=${sessionId}  userId=${user.id}  studentId=${studentId}`);

  ws.on('message', async (data: Buffer | string, isBinary: boolean) => {
    // In ws v8, ALL frames arrive as Buffer regardless of text/binary.
    // Use the isBinary flag (not Buffer.isBuffer) to distinguish audio from JSON.
    if (isBinary) {
      // Binary frame: raw audio chunk from MediaRecorder → forward to Deepgram
      deepgramService.sendAudio(sessionId, Buffer.isBuffer(data) ? data : Buffer.from(data as unknown as ArrayBuffer));
      return;
    }

    // Text frame: JSON control message
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON frame' }));
      return;
    }

    switch (msg.type) {
      case 'start_interview': {
        const questionText = (msg.question_text as string) ?? 'Tell me about yourself';
        const difficulty = ((msg.difficulty as string) ?? 'EASY') as 'EASY' | 'MEDIUM' | 'ADVANCED';
        const turnNumber = (msg.turn_number as number) ?? 1;
        const domain = (msg.domain as string | undefined) ?? 'Technical';

        // Track active turn FIRST so submit_transcript can find it even if
        // loadResumeIntoContext (async, Redis) is still in flight.
        activeTurns.set(sessionId, { questionText, difficulty, turnNumber, domain });

        // Load resume once per session (non-blocking from perspective of activeTurns)
        await loadResumeIntoContext(sessionId, studentId);

        // Initialize session state in Redis on turn 1 (drives topic curriculum + difficulty)
        if (turnNumber <= 1) {
          const existingState = await sessionContextService.getState(sessionId).catch(() => null);
          if (!existingState) {
            const curriculum = await buildTopicCurriculum(studentId);
            await sessionContextService.setState(sessionId, {
              session_id: sessionId,
              student_id: studentId,
              topic_curriculum: curriculum,
              completed_topics: [],
              active_topic: curriculum[0] ?? 'General Programming',
              active_topic_question_count: 0,
              max_questions_per_topic: 4,
              do_not_ask_or_repeat: [],
              current_turn: 1,
              max_turns: 10,
              current_difficulty: 'EASY',
              candidate_performance_trend: 'stable',
              consecutive_weak_answers: 0,
              current_question: questionText,
              current_question_turn: 1,
              current_rubric: {},
              rolling_overall_score: 0,
              rolling_score_turns: 0,
            });
            console.log(`[WS] Session state initialized sessionId=${sessionId} topics=[${curriculum.join(', ')}]`);
          }
        }

        // Open Deepgram streaming session
        await deepgramService.openSession(
          sessionId,
          { questionText, difficulty, turnNumber, studentId, domain },
          async (transcript, meta) => {
            activeTurns.delete(sessionId);
            await triggerLLMEvaluation(sessionId, transcript, meta);
          },
        );

        ws.send(JSON.stringify({ type: 'recording_started', turnNumber }));
        break;
      }

      case 'audio_end': {
        // Student stopped speaking — close Deepgram stream (triggers UtteranceEnd)
        deepgramService.closeSession(sessionId);
        break;
      }

      case 'submit_transcript': {
        // Text fallback path: frontend sends transcript directly (no Deepgram)
        const transcript = ((msg.transcript as string) ?? '').trim();
        if (!transcript) {
          ws.send(JSON.stringify({ type: 'error', message: 'Empty transcript' }));
          break;
        }

        const turn = activeTurns.get(sessionId);
        if (!turn) {
          ws.send(JSON.stringify({ type: 'error', message: 'No active turn — send start_interview first' }));
          break;
        }

        activeTurns.delete(sessionId);
        await loadResumeIntoContext(sessionId, studentId);

        await triggerLLMEvaluation(sessionId, transcript, {
          questionText: turn.questionText,
          difficulty: turn.difficulty,
          turnNumber: turn.turnNumber,
          studentId,
          domain: turn.domain,
        });
        break;
      }

      default:
        ws.send(JSON.stringify({ type: 'error', message: `Unknown message type: ${msg.type}` }));
    }
  });

  ws.on('close', () => {
    console.log(`[WS] disconnected  sessionId=${sessionId}`);
    wsManager.unregister(sessionId);
    activeTurns.delete(sessionId);
    deepgramService.closeSession(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`[WS] error  sessionId=${sessionId}:`, err.message);
  });
}

// ── Factory: attach WS server to existing HTTP server ─────────────────────────

export function createInterviewWsServer(httpServer: import('http').Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/interview' });

  wss.on('connection', (ws, req) => {
    handleConnection(ws, req).catch((err) => {
      console.error('[WS] unhandled connection error:', err);
      try { ws.close(1011, 'Internal error'); } catch {}
    });
  });

  wss.on('error', (err) => {
    console.error('[WS] server error:', err);
  });

  console.log('[WS] interview server attached at /ws/interview');
  return wss;
}
