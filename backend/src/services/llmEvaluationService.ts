/**
 * LLM evaluation triggered by Deepgram UtteranceEnd (WebSocket-driven path).
 * Mirrors POST /api/sessions/:id/turns but invoked from the WS audio pipeline.
 */

import axios from 'axios';
import { IncomingMessage } from 'http';
import { env } from '../config/env';
import { db } from '../shared/db/pool';
import { sessionContextService, TurnContext } from './sessionContextService';
import { wsManager } from './wsManager';
import type { AudioStartMeta } from './deepgramService';

// ── Types (mirrored from interview.routes.ts) ────────────────────────────────

type Difficulty = 'EASY' | 'MEDIUM' | 'ADVANCED';
type AnswerQuality = 'NO_ANSWER' | 'WEAK' | 'PARTIAL' | 'GOOD' | 'EXCELLENT';

interface RawEvaluation {
  answer_quality?: AnswerQuality;
  technical_score: number;
  filler_count: number;
  fluency_score: number;
  clarity_score: number;
  // Rubric dimensions (0-100 each) — present when AI service returns them
  correctness?: number;
  relevance?: number;
  completeness?: number;
  technical_understanding?: number;
  communication?: number;
  rubric_score?: number; // deterministic weighted score computed server-side in Python
  feedback: string;
  strengths: string;
  weaknesses: string;
  next_recommended_difficulty: Difficulty;
  transcript: string;
  stt_raw: string;
  pace_wpm: number;
  conversational_response: string;
  next_question_text: string;
  rubric_for_next_question: Record<string, unknown>;
  update_state: { mark_topic_completed?: string | null; add_to_do_not_ask?: string | null };
  context_summary: string;
  is_clarification?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Patterns where the student provides no technical content
const NO_ANSWER_RE = /^(i ('?m|am) not sure|i don'?t know|no idea|i have no idea|i'?m not familiar|i can'?t answer|i don'?t have|i don'?t remember|i'?m unsure|not sure|no clue|i don'?t understand|i have no (clue|knowledge|answer)|i genuinely don'?t know|i honestly don'?t know|i really don'?t know|don'?t know|i don'?t have an? (idea|answer|clue|knowledge)|couldn'?t answer|i cannot answer|i cannot say|i'?m not aware|not aware|blank|i'm blank|no answer|i have no answer|i don'?t know anything|i don'?t know that|i don'?t know the answer)/i;

function detectAnswerQuality(transcript: string): AnswerQuality | null {
  const t = transcript.trim().toLowerCase();
  // Match short phrases (≤ 12 words) that are clearly no-content
  const wordCount = t.split(/\s+/).length;
  if (wordCount <= 12 && NO_ANSWER_RE.test(t)) return 'NO_ANSWER';
  // Even longer versions if they start with no-content phrases
  if (wordCount <= 20 && (
    t.startsWith("i don't know") ||
    t.startsWith("i dont know") ||
    t.startsWith("i have no idea") ||
    t.startsWith("i'm not sure") ||
    t.startsWith("i am not sure") ||
    t.startsWith("no idea") ||
    t.startsWith("i don't have any idea")
  )) return 'NO_ANSWER';
  return null; // let LLM decide
}

function normaliseScores(raw: RawEvaluation, detectedQuality: AnswerQuality | null) {
  const quality: AnswerQuality = detectedQuality ?? (raw.answer_quality ?? 'PARTIAL');

  let overallScore: number;

  if (raw.rubric_score !== undefined && raw.rubric_score !== null) {
    // Rubric score is already deterministically computed in Python — use it directly
    overallScore = Math.round(raw.rubric_score);
  } else {
    // Fallback: legacy formula (when AI service returns old format)
    let tech = raw.technical_score;
    if (quality === 'NO_ANSWER') tech = Math.min(tech, 1.0);
    else if (quality === 'WEAK') tech = Math.min(tech, 3.0);
    const technicalScoreOld = Math.round(tech * 10);
    const fillerPenalty = Math.max(0, 100 - raw.filler_count * 5);
    const commScore = Math.round(fillerPenalty * 0.7 + (raw.clarity_score ?? 50) * 0.3);
    overallScore = Math.round(technicalScoreOld * 0.7 + commScore * 0.3);
  }

  // Hard safety caps — LLM or rubric cannot give high scores to empty answers
  if (quality === 'NO_ANSWER') overallScore = Math.min(overallScore, 10);
  else if (quality === 'WEAK') overallScore = Math.min(overallScore, 30);

  // Technical score for display: use rubric correctness dimension if available
  const technicalScore = raw.correctness !== undefined
    ? Math.round(raw.correctness)
    : Math.min(
        Math.round(raw.technical_score * 10),
        quality === 'NO_ANSWER' ? 5 : quality === 'WEAK' ? 25 : 100,
      );

  const fillerPenalty = Math.max(0, 100 - raw.filler_count * 5);
  const communicationScore = raw.communication !== undefined
    ? Math.round(raw.communication * 0.7 + fillerPenalty * 0.3)
    : Math.round(fillerPenalty * 0.7 + (raw.clarity_score ?? 50) * 0.3);

  return {
    technicalScore: Math.max(0, Math.min(100, technicalScore)),
    communicationScore: Math.max(0, Math.min(100, communicationScore)),
    overallScore: Math.max(0, Math.min(100, overallScore)),
    quality,
  };
}

const DIFFICULTY_LEVELS: Difficulty[] = ['EASY', 'MEDIUM', 'ADVANCED'];

function determineDifficulty(
  recommended: Difficulty,
  currentScore: number,
  currentDifficulty: Difficulty,
  quality: AnswerQuality,
): Difficulty {
  const idx = DIFFICULTY_LEVELS.indexOf(currentDifficulty);

  // NO_ANSWER / WEAK → never increase difficulty
  if (quality === 'NO_ANSWER' || quality === 'WEAK') {
    return DIFFICULTY_LEVELS[Math.max(idx - 1, 0)];
  }

  // Strong answer → move up exactly one level (never skip)
  if (currentScore >= 70 && (quality === 'GOOD' || quality === 'EXCELLENT')) {
    return DIFFICULTY_LEVELS[Math.min(idx + 1, 2)];
  }

  // Weak-mid answer → stay same
  if (currentScore < 40) {
    return DIFFICULTY_LEVELS[Math.max(idx - 1, 0)];
  }

  // Mid-range PARTIAL → stay same difficulty, don't trust LLM to jump levels
  if (quality === 'PARTIAL') {
    return currentDifficulty;
  }

  // LLM recommendation for GOOD/EXCELLENT edge cases, but never jump more than 1 level
  const recIdx = DIFFICULTY_LEVELS.indexOf(recommended);
  const safeIdx = Math.min(Math.max(recIdx, 0), idx + 1); // can go up at most 1
  return DIFFICULTY_LEVELS[Math.max(safeIdx, Math.max(idx - 1, 0))];
}

async function consumeAIStream(
  stream: IncomingMessage,
  sessionId: string,
): Promise<RawEvaluation | null> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    let result: RawEvaluation | null = null;

    stream.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as {
            type: string;
            text?: string;
            data?: RawEvaluation;
            message?: string;
          };
          if (event.type === 'text_chunk' && event.text) {
            wsManager.emit(sessionId, { type: 'text_chunk', text: event.text });
          } else if (event.type === 'text_end') {
            wsManager.emit(sessionId, { type: 'text_end' });
          } else if (event.type === 'result' && event.data) {
            result = event.data;
          } else if (event.type === 'error') {
            reject(new Error(event.message ?? 'AI service error'));
          }
        } catch {
          // malformed SSE line — skip
        }
      }
    });

    stream.on('end', () => resolve(result));
    stream.on('error', (err) => reject(err));
  });
}

// ── Clarification / repeat-request detection ─────────────────────────────────

// Covers all common "please repeat" phrasings from the requirements spec
const CLARIFICATION_RE =
  /^(can you |could you |please |would you )?(repeat|repeat the question|say that again|come again|pardon|ask that again|ask again|what(\?+)?|huh(\?+)?|sorry(\?+)?|i (didn't|did not|couldn't|could not) (hear|understand|catch) (that|you|the question)(\s+please)?|i didn't catch that|i couldn't hear|i missed that|didn't hear the question)(\?+)?$/i;

// Phrases where even multi-word forms should be detected as repeat requests
const REPEAT_PHRASES = [
  'repeat please',
  'please repeat',
  'repeat the question',
  'repeat that',
  'say it again',
  "i didn't hear the question",
  "i didn't hear that",
  'could you ask that again',
  'can you ask that again',
  'could you repeat that',
  'could you repeat the question',
  'can you repeat the question',
  'please ask that again',
  'i missed that',
  'say the question again',
];

function isClarificationRequest(transcript: string): boolean {
  const t = transcript.trim().toLowerCase().replace(/[?!.]+$/, '');
  if (t.split(/\s+/).length <= 10 && CLARIFICATION_RE.test(t)) return true;
  return REPEAT_PHRASES.some(p => t === p || t.startsWith(p));
}

// ── Garbage / noise transcript detection ─────────────────────────────────────

// Whitelisted short answers that must never be rejected (common valid technical answers)
const SHORT_ANSWER_WHITELIST = new Set([
  'yes', 'no', 'java', 'python', 'c', 'c++', 'sql', 'html', 'css',
  'yes sir', 'no sir', 'true', 'false', 'null', 'none', 'zero', 'one',
  'i do', 'i don\'t', 'i know', 'i don\'t know', 'not sure', 'unsure',
]);

function isNoisyTranscript(transcript: string): boolean {
  const t = transcript.trim();
  if (!t) return true;
  // All non-alphanumeric (punctuation / symbols / noise)
  if (!/[a-zA-Z]/.test(t)) return true;
  const words = t.split(/\s+/);
  const lower = t.toLowerCase();
  // Whitelisted short answers are always valid
  if (SHORT_ANSWER_WHITELIST.has(lower)) return false;
  // Very short (single non-whitelisted char) — likely noise
  if (t.length < 2) return true;
  // Single word that is pure noise chars
  if (words.length === 1 && t.length < 3 && !/[aeiou]/i.test(t)) return true;
  return false;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function triggerLLMEvaluation(
  sessionId: string,
  transcript: string,
  meta: AudioStartMeta,
): Promise<void> {
  const cleanTranscript = transcript.trim();

  // ── 1. Send confirmed transcript to client immediately (visible before eval) ─
  wsManager.emit(sessionId, {
    type: 'transcript_final',
    text: cleanTranscript,
    turnNumber: meta.turnNumber,
  });

  // ── 2. Reject garbage/noise — stay on same question ──────────────────────────
  if (isNoisyTranscript(cleanTranscript)) {
    wsManager.emit(sessionId, {
      type: 'invalid_transcript',
      message: "Sorry, I couldn't clearly understand that. Please try answering again.",
      turnNumber: meta.turnNumber,
    });
    return;
  }

  // ── 3. Detect repeat-request — re-deliver question, no evaluation ─────────────
  if (isClarificationRequest(cleanTranscript)) {
    wsManager.emit(sessionId, {
      type: 'clarification',
      question: meta.questionText,
      message: "Sure — here's the question again:",
    });
    return;
  }

  const [interviewState, shortTermContext, resume] = await Promise.all([
    sessionContextService.getState(sessionId).catch(() => null),
    sessionContextService.getTurns(sessionId, 5).catch(() => [] as TurnContext[]),
    sessionContextService.getResume(sessionId).catch(() => null),
  ]);

  // Build short summaries list AND full recent Q/A pairs for the AI
  const shortTermSummaries = shortTermContext.slice(-5).map(c => c.summary).filter(Boolean);
  const recentTurns = shortTermContext.slice(-5).map(c => ({
    turn: c.turn,
    question: c.question,
    answer: c.answer,
    difficulty: c.difficulty,
  }));

  const currentRubric = interviewState?.current_rubric ?? null;

  wsManager.emit(sessionId, { type: 'status', stage: 'evaluating' });
  wsManager.emit(sessionId, { type: 'status', stage: 'generating' });

  let raw: RawEvaluation | null = null;
  try {
    const aiResp = await axios.post(
      `${env.AI_SERVICE_URL}/ai/evaluate-response-text`,
      {
        transcript: cleanTranscript,
        metadata: {
          question_text: meta.questionText,
          difficulty: meta.difficulty,
          turn_number: meta.turnNumber,
          session_id: sessionId,
          student_id: meta.studentId,
          domain: meta.domain,
          interview_state: interviewState ?? {},
          short_term_context: shortTermSummaries,
          recent_turns: recentTurns,
          current_rubric: currentRubric ?? {},
          resume: resume ?? {},
        },
      },
      { timeout: 120_000, responseType: 'stream' },
    );
    raw = await consumeAIStream(aiResp.data as IncomingMessage, sessionId);
  } catch (err) {
    console.error('[llmEvaluation] AI service error:', err);
    wsManager.emit(sessionId, { type: 'error', message: 'AI service unavailable' });
    return;
  }

  if (!raw) {
    wsManager.emit(sessionId, { type: 'error', message: 'Empty AI response' });
    return;
  }

  // LLM confirmed this was a clarification request — re-speak the question, skip all storage
  if (raw.is_clarification) {
    wsManager.emit(sessionId, {
      type: 'clarification',
      question: meta.questionText,
      message: "Sure! Here's the question again:",
    });
    return;
  }

  // Deterministic quality detection — overrides LLM if it hallucinated a high score
  const detectedQuality = detectAnswerQuality(cleanTranscript);

  const { technicalScore, communicationScore, overallScore, quality } = normaliseScores(raw, detectedQuality);
  const nextDifficulty = determineDifficulty(
    raw.next_recommended_difficulty,
    technicalScore,
    meta.difficulty,
    quality,
  );

  // Deduplicate next question: collect all previous question texts from session history
  const allPrevQuestions = shortTermContext.map(t => t.question.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim());
  const proposedQ = (raw.next_question_text ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const isDuplicate = proposedQ.length > 10 && allPrevQuestions.some(prev => {
    if (prev === proposedQ) return true;
    // Word overlap > 70%
    const pWords = new Set(prev.split(/\s+/).filter(w => w.length > 3));
    const qWords = proposedQ.split(/\s+/).filter(w => w.length > 3);
    if (pWords.size === 0 || qWords.length === 0) return false;
    const matches = qWords.filter(w => pWords.has(w)).length;
    return matches / Math.max(pWords.size, qWords.length) > 0.7;
  });
  if (isDuplicate) {
    console.warn(`[llmEval] Duplicate question detected, clearing next_question_text for session ${sessionId}`);
    raw.next_question_text = '';
  }

  // Always add current question to do_not_ask (don't rely solely on LLM's update_state)
  const doNotAskEntry = meta.questionText || raw.update_state?.add_to_do_not_ask || null;

  const updatedState = await sessionContextService
    .updateState(sessionId, {
      mark_topic_completed: raw.update_state?.mark_topic_completed ?? null,
      add_to_do_not_ask: doNotAskEntry,
      next_recommended_difficulty: nextDifficulty, // use our deterministic result, not raw LLM
      increment_turn: true,
      increment_topic_question_count: true,
      current_question: raw.next_question_text ?? '',
      current_question_turn: meta.turnNumber + 1,
      current_rubric: raw.rubric_for_next_question ?? {},
      overall_score: overallScore,
    })
    .catch(() => null);

  if (raw.transcript || cleanTranscript) {
    const turnCtx: TurnContext = {
      turn: meta.turnNumber,
      question: meta.questionText,
      answer: cleanTranscript,
      summary: raw.context_summary || '',
      difficulty: meta.difficulty,
      ts: new Date().toISOString(),
    };
    await sessionContextService.appendTurn(sessionId, turnCtx).catch(() => {});
  }

  const turnPayload = {
    transcript: cleanTranscript,
    technicalScore,
    communicationScore,
    overallScore,
    feedback: raw.feedback ?? '',
    strengths: raw.strengths ?? '',
    weaknesses: raw.weaknesses ?? '',
    nextDifficulty,
    nextQuestionText: raw.next_question_text ?? '',
    contextSummary: raw.context_summary ?? '',
    conversationalResponse: raw.conversational_response ?? '',
    audioMetrics: {
      paceWpm: 0,
      fillerCount: raw.filler_count ?? 0,
      fluencyScore: 0,
      clarityScore: raw.clarity_score ?? 0,
    },
  };

  wsManager.emit(sessionId, { type: 'turn_result', data: turnPayload });

  // DB write — direct insert (does not require Redis)
  process.nextTick(async () => {
    try {
      await db.query(
        `INSERT INTO session.interview_transcripts
           (session_id, student_id, turn_number, transcript_text, metadata)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT ON CONSTRAINT uq_transcripts_session_turn DO NOTHING`,
        [
          sessionId,
          meta.studentId,
          meta.turnNumber,
          cleanTranscript,
          JSON.stringify({
            question_text: meta.questionText,
            difficulty: meta.difficulty,
            technical_score: turnPayload.technicalScore,
            communication_score: turnPayload.communicationScore,
            overall_score: turnPayload.overallScore,
            feedback: turnPayload.feedback,
            strengths: turnPayload.strengths,
            weaknesses: turnPayload.weaknesses,
            next_question_text: turnPayload.nextQuestionText,
            next_difficulty: turnPayload.nextDifficulty,
            context_summary: turnPayload.contextSummary,
          }),
        ],
      );
      console.log(`[llmEval] turn ${meta.turnNumber} persisted to DB`);

      // Also try Redis-backed context (degrades gracefully when Redis absent)
      const isTopicSwitch = Boolean(raw?.update_state?.mark_topic_completed);
      const isFiveTurnMark = meta.turnNumber % 5 === 0;
      if (updatedState && (isTopicSwitch || isFiveTurnMark)) {
        await sessionContextService.checkpointToDb(sessionId);
      }
    } catch (err) {
      console.error('[llmEvaluation] post-turn async error:', err);
    }
  });
}
