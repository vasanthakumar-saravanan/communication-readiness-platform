/**
 * Live mock interview turn engine, driven by the interview WebSocket gateway.
 *
 * Per answer:
 *   1. "Repeat that?" / silence / a question about the question → re-ask, turn not used
 *   2. AI service scores technical content, fluency and clarity (POST /ai/evaluate-turn)
 *   3. Pace and fillers are MEASURED here from the transcript and speaking time
 *   4. Communication = Fluency 35% + Pace 25% + Fillers 20% + Clarity 20%;
 *      turn overall = Technical 70% + Communication 30%   (PROJECT_BLUEPRINT §9.2)
 *   5. Difficulty moves one level: technical ≥ 80 → up, < 50 → down
 *   6. Next question follows up on this answer (POST /ai/generate-question)
 *   7. After the last turn (or when time runs out) the server builds the report and
 *      completes the attempt.
 * All state lives server-side (sessionContextService) and survives reconnects/restarts.
 */

import axios from 'axios';
import { env } from '../config/env';
import { db } from '../shared/db/pool';
import { sessionContextService, InterviewState, TurnResult } from './sessionContextService';
import { concludeLiveInterview, terminateLiveInterview } from './interviewSessionService';
import { buildInterviewReport, InterviewReport } from './interviewReport';
import {
  computeSpeechMetrics, communicationScore, overallScore, scorePauses, blendFluency, blendTechnical,
} from './speechMetrics';
import { wsManager } from './wsManager';
import type { AudioStartMeta } from './deepgramService';

type Difficulty = 'EASY' | 'MEDIUM' | 'ADVANCED';
const LEVELS: Difficulty[] = ['EASY', 'MEDIUM', 'ADVANCED'];

// AI service TurnEvaluationResponse (scores 0-10)
interface TurnEvaluation {
  technical_score: number;
  communication_score: number;
  fluency_score?: number | null;
  clarity_score?: number | null;
  feedback: string;
  strengths: string;
  weaknesses: string;
  is_clarification?: boolean;
  clarification_response?: string;
  points_covered?: string[];
  points_missed?: string[];
}

// Delivery measurements the browser takes while the candidate speaks
export interface DeliveryMetrics {
  durationSec?: number | null;        // first → last voice activity
  pauseCount?: number | null;         // silences ≥ PAUSE_THRESHOLD_SEC mid-answer
  longestPauseSec?: number | null;
  responseLatencySec?: number | null; // question finished → first words
}

const AI_TIMEOUT_MS = 60_000;
const MAX_CLARIFICATIONS_PER_QUESTION = 2;
const MAX_CONSECUTIVE_AI_FAILURES = 3;

// Used when question generation fails, so one LLM hiccup does not end the interview.
const FALLBACK_QUESTIONS: Record<Difficulty, string> = {
  EASY: 'Explain the difference between synchronous and asynchronous programming, with an example.',
  MEDIUM: 'How would you design a rate limiter for a high-traffic API?',
  ADVANCED: 'Describe a distributed consensus algorithm and the trade-offs it makes.',
};

// One level at a time: strong answers move up, weak answers move down (BACKEND_TEAM_MODULE_ALLOCATION §3.4).
export function nextDifficulty(current: Difficulty, technicalScore: number): Difficulty {
  const index = LEVELS.indexOf(current);
  if (technicalScore >= 80) return LEVELS[Math.min(index + 1, LEVELS.length - 1)];
  if (technicalScore < 50) return LEVELS[Math.max(index - 1, 0)];
  return current;
}

const to100 = (score: number | null | undefined, fallback: number) =>
  Math.max(0, Math.min(100, Math.round((typeof score === 'number' ? score : fallback) * 10)));

// ── Clarification detection (no LLM needed) ──────────────────────────────────

// Short utterances asking the interviewer to repeat or rephrase — skip the LLM,
// don't consume the turn, re-send the current question. Patterns are anchored to
// the start so a real answer that merely contains "repeat" is still evaluated.
const CLARIFICATION_PATTERNS = [
  /^(sorry|pardon|huh|what|come again|excuse me)( me)?$/,
  /^(sorry |excuse me )?(please )?(can|could|would|will) you (please )?(repeat|rephrase|say|ask|read)\b/,
  /^(please )?(repeat|rephrase|say) (that|it|the question|again|once more)\b/,
  /^(please )?(repeat|rephrase)( please)?$/,
  /^(sorry )?i (didn'?t|did not|couldn'?t|could not|can'?t|cannot) (hear|catch|understand|get) (that|you|the question|it)\b/,
  /^what (was|is) the question\b/,
  /\bone more time$/,
];

// Short replies that are a genuine "I don't know" and should be scored, not probed
const NON_ANSWER_RE = /\b(don'?t know|dunno|no idea|not sure|skip|pass|next)\b/i;

function isRepeatRequest(transcript: string): boolean {
  const t = transcript.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.split(' ').length > 10) return false;
  return CLARIFICATION_PATTERNS.some((pattern) => pattern.test(t));
}

// Maps the evaluator's covered list back onto the rubric. It is asked to copy the
// key points verbatim; tolerate case/punctuation changes and minor rewording.
function matchCoveredPoints(keyPoints: string[], coveredByLlm: string[] | undefined): string[] {
  const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const claimed = (coveredByLlm ?? []).map(normalise).filter(Boolean);
  return keyPoints.filter((point) => {
    const key = normalise(point);
    return claimed.some((c) => c === key || c.includes(key) || key.includes(c));
  });
}

// ── AI calls ──────────────────────────────────────────────────────────────────

async function evaluateWithRetry(meta: AudioStartMeta, transcript: string, keyPoints: string[]): Promise<TurnEvaluation> {
  const request = {
    question_text: meta.questionText,
    student_answer: transcript,
    difficulty: meta.difficulty,
    turn_number: meta.turnNumber,
    domain: meta.domain,
    expected_points: keyPoints,
  };
  try {
    return (await axios.post<TurnEvaluation>(`${env.AI_SERVICE_URL}/ai/evaluate-turn`, request, { timeout: AI_TIMEOUT_MS })).data;
  } catch (firstErr) {
    console.warn('[interview] evaluate-turn failed, retrying once:', (firstErr as Error).message);
    await new Promise((resolve) => setTimeout(resolve, 800));
    return (await axios.post<TurnEvaluation>(`${env.AI_SERVICE_URL}/ai/evaluate-turn`, request, { timeout: AI_TIMEOUT_MS })).data;
  }
}

async function generateNextQuestion(
  state: InterviewState,
  meta: AudioStartMeta,
  difficulty: Difficulty,
): Promise<{ text: string; category: string; keyPoints: string[] }> {
  const resume = state.resume;
  try {
    const { data } = await axios.post<{ question_text?: string; category?: string | null; key_points?: string[] }>(
      `${env.AI_SERVICE_URL}/ai/generate-question`,
      {
        student_name: resume?.name ?? 'Candidate',
        skills: resume?.skills ?? [],
        projects: resume?.projects ?? [],
        difficulty,
        domain: meta.domain,
        // The candidate's actual answers (plus evaluator notes) let the AI ask a
        // follow-up on what they just said instead of an unrelated question.
        previous_turns: (state.turn_results ?? []).slice(-5).map((t) => ({
          question_text: t.question,
          student_answer: t.answer,
          difficulty: t.difficulty,
          technical_score: t.technicalScore,
          feedback: [t.feedback, t.weaknesses && `Missing: ${t.weaknesses}`].filter(Boolean).join(' '),
        })),
      },
      { timeout: AI_TIMEOUT_MS },
    );
    const text = data?.question_text?.trim();
    const asked = new Set((state.turn_results ?? []).map((t) => t.question.trim().toLowerCase()));
    if (text && !asked.has(text.toLowerCase())) {
      const keyPoints = (data.key_points ?? [])
        .filter((point): point is string => typeof point === 'string' && point.trim().length > 0)
        .map((point) => point.trim().slice(0, 160))
        .slice(0, 6);
      return { text, category: data.category?.trim() || 'Technical', keyPoints };
    }
  } catch (err) {
    console.error('[interview] generate-question failed, using fallback question:', (err as Error).message);
  }
  return { text: FALLBACK_QUESTIONS[difficulty], category: 'Fundamentals', keyPoints: [] };
}

// ── Completion ────────────────────────────────────────────────────────────────

async function complete(sessionId: string, state: InterviewState): Promise<InterviewReport & { coins?: number }> {
  const report = buildInterviewReport({
    attemptId: state.attempt_id ?? sessionId,
    turns: state.turn_results ?? [],
    plannedTurns: state.max_turns,
    tabSwitches: state.tab_switches ?? 0,
  });
  await sessionContextService.setState(sessionId, { ...state, status: 'COMPLETED', current_question: '' });
  if (state.attempt_id) {
    try {
      await concludeLiveInterview(sessionId, state.attempt_id, report);
    } catch (err) {
      console.error('[interview] storing the server-built report failed:', err);
    }
  }
  return report;
}

async function terminate(sessionId: string, state: InterviewState, reason: string): Promise<void> {
  await sessionContextService.setState(sessionId, { ...state, status: 'TERMINATED', current_question: '' });
  if (state.attempt_id) {
    await terminateLiveInterview(sessionId, state.attempt_id).catch((err) =>
      console.error('[interview] terminating attempt failed:', err));
  }
  wsManager.emit(sessionId, { type: 'terminated', reason });
  wsManager.close(sessionId, 4409, 'Interview ended');
}

// ── Main turn handler ─────────────────────────────────────────────────────────

export async function triggerLLMEvaluation(
  sessionId: string,
  transcript: string,
  meta: AudioStartMeta,
  options: DeliveryMetrics & { isFinal?: boolean } = {},
): Promise<void> {
  const state = await sessionContextService.getState(sessionId);
  if (!state || state.status !== 'ACTIVE') {
    wsManager.emit(sessionId, { type: 'error', message: 'This interview has already ended.' });
    return;
  }

  const reask = async (message: string) => {
    await sessionContextService.setState(sessionId, state);
    wsManager.emit(sessionId, { type: 'clarification', question: meta.questionText, message });
  };

  // Silence or a plain "repeat that" — re-ask without the LLM, turn not used
  if (!transcript.trim()) {
    if (options.isFinal) { await finishInterview(sessionId); return; }
    await reask("I didn't hear an answer. Here's the question again:");
    return;
  }
  if (isRepeatRequest(transcript) && !options.isFinal) {
    await reask("Sure — here's the question again:");
    return;
  }
  // A one- or two-word reply is usually speech recognition cutting the answer short, so
  // ask once for more instead of scoring it 0 (a plain "I don't know" is still scored).
  const wordCount = transcript.trim().split(/\s+/).length;
  const clarificationsSoFar = state.clarifications_this_turn ?? 0;
  if (wordCount < 3 && !NON_ANSWER_RE.test(transcript)
      && clarificationsSoFar < MAX_CLARIFICATIONS_PER_QUESTION && !options.isFinal) {
    state.clarifications_this_turn = clarificationsSoFar + 1;
    await reask('Could you expand on that a little? Here is the question again:');
    return;
  }

  wsManager.emit(sessionId, { type: 'status', stage: 'evaluating' });

  let evaluation: TurnEvaluation;
  try {
    evaluation = await evaluateWithRetry(meta, transcript, state.current_key_points ?? []);
    state.consecutive_ai_failures = 0;
  } catch (err) {
    console.error('[interview] evaluate-turn failed twice:', (err as Error).message);
    state.consecutive_ai_failures = (state.consecutive_ai_failures ?? 0) + 1;
    if (state.consecutive_ai_failures >= MAX_CONSECUTIVE_AI_FAILURES) {
      await sessionContextService.setState(sessionId, state);
      wsManager.emit(sessionId, {
        type: 'error',
        message: 'The AI interviewer is unavailable right now. Your answers so far are saved — please try again later.',
      });
      return;
    }
    // Keep the interview hands-free: ask again instead of stalling on an error banner
    await reask('Sorry, I had trouble processing that answer. Could you answer again?');
    return;
  }

  // The candidate asked about the question — explain and re-ask (capped, then score as an answer)
  const clarifications = state.clarifications_this_turn ?? 0;
  if (evaluation.is_clarification && clarifications < MAX_CLARIFICATIONS_PER_QUESTION && !options.isFinal) {
    state.clarifications_this_turn = clarifications + 1;
    await reask(evaluation.clarification_response?.trim() || 'Let me rephrase the question:');
    return;
  }

  // ── Score the turn ──
  const speech = computeSpeechMetrics(transcript, options.durationSec);
  const keyPoints = state.current_key_points ?? [];
  const pointsCovered = matchCoveredPoints(keyPoints, evaluation.points_covered);
  const pointsMissed = keyPoints.filter((point) => !pointsCovered.includes(point));
  const llmTechnical = to100(evaluation.technical_score, 0);
  // Technical = 60% evaluator judgement + 40% rubric coverage
  const technicalScore = blendTechnical(llmTechnical, pointsCovered.length, keyPoints.length);
  // A non-answer (technical 0: "I don't know", off-topic, asking for a score) has no
  // delivery worth measuring, so pace, fillers and pauses don't lift its communication score.
  const isNonAnswer = llmTechnical === 0;
  const measurable = !isNonAnswer && speech.wpm !== null;
  const pauseScore = measurable ? scorePauses(options.pauseCount, speech.durationSec) : null;
  // Fluency = 70% evaluator judgement + 30% measured pauses
  const fluencyScore = blendFluency(to100(evaluation.fluency_score, evaluation.communication_score), pauseScore);
  const clarityScore = to100(evaluation.clarity_score, evaluation.communication_score);
  const fillerScore = isNonAnswer ? null : speech.fillerScore;
  const paceScore = isNonAnswer ? null : speech.paceScore;
  const commScore = communicationScore({ fluency: fluencyScore, clarity: clarityScore, fillerScore, paceScore });
  const turnOverall = overallScore(technicalScore, commScore);
  const difficultyNext = nextDifficulty(meta.difficulty, technicalScore);

  const result: TurnResult = {
    turn: meta.turnNumber,
    question: meta.questionText,
    difficulty: meta.difficulty,
    category: state.current_category || 'Technical',
    answer: transcript,
    technicalScore,
    llmTechnicalScore: llmTechnical,
    keyPoints,
    pointsCovered,
    pointsMissed,
    fluencyScore,
    clarityScore,
    communicationScore: commScore,
    overallScore: turnOverall,
    wpm: speech.wpm,
    paceLabel: speech.paceLabel,
    paceScore,
    fillerScore,
    pauseCount: measurable && typeof options.pauseCount === 'number' ? options.pauseCount : null,
    longestPauseSec: measurable && typeof options.longestPauseSec === 'number' ? options.longestPauseSec : null,
    responseLatencySec: typeof options.responseLatencySec === 'number' && options.responseLatencySec >= 0
      && options.responseLatencySec < 120 ? Math.round(options.responseLatencySec * 10) / 10 : null,
    fillerCount: speech.fillerCount,
    fillerBreakdown: speech.fillerBreakdown,
    feedback: evaluation.feedback ?? '',
    strengths: evaluation.strengths ?? '',
    weaknesses: evaluation.weaknesses ?? '',
    ts: new Date().toISOString(),
  };
  state.turn_results = [...(state.turn_results ?? []), result];
  state.clarifications_this_turn = 0;
  state.current_turn = meta.turnNumber + 1;
  state.current_difficulty = difficultyNext;
  state.rolling_score_turns = state.turn_results.length;
  state.rolling_overall_score = Math.round(state.turn_results.reduce((s, t) => s + t.overallScore, 0) / state.turn_results.length);

  // Transcript row (student_id is org.students.id)
  db.query(
    `INSERT INTO session.interview_transcripts
       (session_id, student_id, turn_number, transcript_text, metadata)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ON CONSTRAINT uq_transcripts_session_turn DO NOTHING`,
    [
      sessionId,
      meta.studentId,
      meta.turnNumber,
      transcript,
      JSON.stringify({
        question_text: meta.questionText,
        difficulty: meta.difficulty,
        category: state.current_category || 'Technical',
        technical_score: technicalScore,
        communication_score: commScore,
        overall_score: turnOverall,
        fluency_score: fluencyScore,
        clarity_score: clarityScore,
        wpm: speech.wpm,
        pace_label: speech.paceLabel,
        pace_score: paceScore,
        filler_count: speech.fillerCount,
        filler_breakdown: speech.fillerBreakdown,
        filler_score: fillerScore,
        pause_count: result.pauseCount,
        longest_pause_sec: result.longestPauseSec,
        response_latency_sec: result.responseLatencySec,
        key_points: keyPoints,
        points_covered: pointsCovered,
        points_missed: pointsMissed,
        feedback: result.feedback,
        strengths: result.strengths,
        weaknesses: result.weaknesses,
      }),
    ],
  ).catch((err) => console.error('[interview] transcript insert failed:', err));

  const isFinal = options.isFinal || meta.turnNumber >= state.max_turns;
  let nextQuestion = '';
  let report: InterviewReport | undefined;
  if (isFinal) {
    report = await complete(sessionId, state);
  } else {
    wsManager.emit(sessionId, { type: 'status', stage: 'generating' });
    const next = await generateNextQuestion(state, meta, difficultyNext);
    nextQuestion = next.text;
    state.current_question = next.text;
    state.current_question_turn = state.current_turn;
    state.current_category = next.category;
    state.current_key_points = next.keyPoints;
    state.do_not_ask_or_repeat = [...state.do_not_ask_or_repeat, next.text].slice(-15);
    await sessionContextService.setState(sessionId, state);
  }

  wsManager.emit(sessionId, {
    type: 'turn_result',
    data: {
      transcript,
      technicalScore,
      communicationScore: commScore,
      overallScore: turnOverall,
      fluencyScore,
      clarityScore,
      feedback: result.feedback,
      strengths: result.strengths,
      weaknesses: result.weaknesses,
      nextDifficulty: difficultyNext,
      nextQuestionText: nextQuestion,
      conversationalResponse: '',
      audioMetrics: {
        paceWpm: speech.wpm,
        paceLabel: speech.paceLabel,
        fillerCount: speech.fillerCount,
        fillerBreakdown: speech.fillerBreakdown,
        pauseCount: result.pauseCount,
        longestPauseSec: result.longestPauseSec,
        responseLatencySec: result.responseLatencySec,
      },
      // How this turn's score was built (shown to the candidate)
      scoreBreakdown: {
        technical: { score: technicalScore, evaluator: llmTechnical, keyPointsCovered: pointsCovered.length, keyPointsTotal: keyPoints.length },
        communication: { score: commScore, fluency: fluencyScore, pace: paceScore, fillers: fillerScore, clarity: clarityScore, pauses: pauseScore },
        formula: 'Overall = Technical 70% + Communication 30%; Communication = Fluency 35% + Pace 25% + Fillers 20% + Clarity 20%',
      },
      keyPoints: { covered: pointsCovered, missed: pointsMissed },
      ...(report ? { report } : {}),
    },
  });
}

// Time ran out (or the candidate ended early): report on what was answered.
export async function finishInterview(sessionId: string): Promise<void> {
  const state = await sessionContextService.getState(sessionId);
  if (!state || state.status !== 'ACTIVE') return;
  if (!state.turn_results?.length) {
    await terminate(sessionId, state, 'Time ran out before any question was answered, so no score was recorded.');
    return;
  }
  const report = await complete(sessionId, state);
  wsManager.emit(sessionId, { type: 'interview_complete', report });
}

// Tab switches / fullscreen exits reported by the browser. At the limit the
// interview is terminated (disqualified) server-side, whatever the client does.
export async function recordProctorEvent(sessionId: string, event: 'TAB_SWITCH' | 'FULLSCREEN_EXIT'): Promise<void> {
  const state = await sessionContextService.getState(sessionId);
  if (!state || state.status !== 'ACTIVE') return;

  // A hidden tab can fire several events at once; count one per second at most
  const now = Date.now();
  if (state.last_proctor_event_at && now - state.last_proctor_event_at < 1000) return;
  state.last_proctor_event_at = now;

  if (event === 'FULLSCREEN_EXIT') {
    state.fullscreen_exits = (state.fullscreen_exits ?? 0) + 1;
    await sessionContextService.setState(sessionId, state);
    return;
  }
  state.tab_switches = (state.tab_switches ?? 0) + 1;
  const limit = env.MAX_TAB_SWITCH_LIMIT + 1; // default 3 allowed → disqualified on the 4th
  if (state.tab_switches >= limit) {
    await terminate(sessionId, state, `Disqualified: ${state.tab_switches} tab switches (limit ${limit - 1}).`);
    return;
  }
  await sessionContextService.setState(sessionId, state);
  wsManager.emit(sessionId, { type: 'proctor_warning', tabSwitches: state.tab_switches, limit });
}
