/**
 * Interview session lifecycle shared by the HTTP routes (/api/sessions) and the
 * live interview WebSocket gateway.
 *
 * One interview = assessment.assessment_attempts row + session.assessment_sessions
 * row. The assessment_sessions id doubles as the session.interview_sessions id
 * (transcript checkpoints) and the live gateway / Redis session key.
 */

import { PoolClient } from 'pg';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { env } from '../config/env';
import { eventBus } from '../shared/events/eventBus';
import { Events, AttemptCompletedPayload } from '../shared/events/events';
import { sessionContextService, InterviewState, InterviewResume } from './sessionContextService';
import type { InterviewReport } from './interviewReport';

export const FIRST_QUESTION =
  "Tell me about yourself. Walk me through your background, the key skills you've built, and what you've been working on most recently.";

// Rubric for the opening question (later questions get theirs from the AI with the question)
export const FIRST_QUESTION_KEY_POINTS = [
  'Education or background in one or two sentences',
  'Key technical skills relevant to the role',
  'A specific recent project and the problem it solved',
  'Their own role or contribution in that work',
  'An outcome, result or what they learned',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StudentContext {
  id: string;
  program_id: string;
  batch_id: string;
  subdivision_id: string | null;
}

export interface AttemptScores {
  overallScore: number;
  technicalScore: number | null;
  communicationScore: number | null;
  listeningScore: number | null;
}

// Creates the attempt + session rows for a student, using the first active
// assessment as the template. Returns both ids.
//
// Only one IN_PROGRESS attempt per student and assessment is allowed
// (idx_attempts_one_active). Starting again means the student left the earlier
// interview (closed the tab, exited), so that attempt is marked ABANDONED.
export async function createAttemptAndSession(
  student: StudentContext,
): Promise<{ attemptId: string; sessionId: string }> {
  const { rows: assessmentRows } = await db.query<{ id: string }>(
    `SELECT id FROM assessment.assessments WHERE is_active = true ORDER BY created_at LIMIT 1`
  );
  if (assessmentRows.length === 0) {
    throw new AppError(503, 'No active assessment configuration found', 'NO_ASSESSMENT');
  }

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: abandoned } = await client.query<{ id: string }>(
      `UPDATE assessment.assessment_attempts
       SET status = 'ABANDONED', completed_at = now()
       WHERE student_id = $1 AND assessment_id = $2 AND status = 'IN_PROGRESS'
       RETURNING id`,
      [student.id, assessmentRows[0].id]
    );
    if (abandoned.length > 0) {
      const abandonedIds = abandoned.map((row) => row.id);
      await client.query(
        `UPDATE session.assessment_sessions SET state = 'TERMINATED', last_activity_at = now()
         WHERE attempt_id = ANY($1::uuid[])`,
        [abandonedIds]
      );
      await client.query(
        `UPDATE session.interview_sessions SET status = 'abandoned', ended_at = now(), updated_at = now()
         WHERE id IN (SELECT id FROM session.assessment_sessions WHERE attempt_id = ANY($1::uuid[]))`,
        [abandonedIds]
      );
    }

    const { rows: attemptRows } = await client.query<{ id: string }>(
      `INSERT INTO assessment.assessment_attempts
         (assessment_id, student_id, interview_type, program_id, batch_id,
          subdivision_id, assessment_version, scoring_version, status, started_at)
       VALUES ($1,$2,'TECHNICAL',$3,$4,$5,1,'v1.0','IN_PROGRESS',now())
       RETURNING id`,
      [assessmentRows[0].id, student.id, student.program_id, student.batch_id, student.subdivision_id]
    );
    const attemptId = attemptRows[0].id;

    const { rows: sessionRows } = await client.query<{ id: string }>(
      `INSERT INTO session.assessment_sessions
         (attempt_id, current_sequence_no, state, last_activity_at)
       VALUES ($1, 0, 'ACTIVE', now())
       RETURNING id`,
      [attemptId]
    );
    await client.query('COMMIT');
    return { attemptId, sessionId: sessionRows[0].id };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Ownership lookup used by the WebSocket gateway ───────────────────────────

export interface OwnedSession {
  sessionId: string;
  attemptId: string;
  studentId: string;
  attemptStatus: string;
}

export async function loadOwnedSession(sessionId: string, userId: string): Promise<OwnedSession> {
  if (!UUID_RE.test(sessionId)) throw new AppError(404, 'Interview session not found', 'NOT_FOUND');

  const { rows } = await db.query<{
    attempt_id: string; student_id: string; status: string; user_id: string;
  }>(
    `SELECT ss.attempt_id, a.student_id, a.status, s.user_id
     FROM session.assessment_sessions ss
     JOIN assessment.assessment_attempts a ON a.id = ss.attempt_id
     JOIN org.students s ON s.id = a.student_id
     WHERE ss.id = $1`,
    [sessionId]
  );
  if (rows.length === 0) throw new AppError(404, 'Interview session not found', 'NOT_FOUND');
  if (rows[0].user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');

  return {
    sessionId,
    attemptId: rows[0].attempt_id,
    studentId: rows[0].student_id,
    attemptStatus: rows[0].status,
  };
}

// ── Completion: marks the attempt complete, stores the report, notifies M3 ───

// Returns false when the attempt was already completed (idempotent); refuses
// attempts that were abandoned because a newer interview was started.
export async function completeAttempt(
  sessionId: string,
  attemptId: string,
  scores: AttemptScores,
  goal: string,
  componentScores?: Record<string, unknown>,
): Promise<boolean> {
  const { rows: attemptRows } = await db.query<{
    student_id: string; program_id: string; batch_id: string; subdivision_id: string | null; status: string;
  }>(
    `SELECT student_id, program_id, batch_id, subdivision_id, status
     FROM assessment.assessment_attempts WHERE id = $1`,
    [attemptId]
  );
  if (attemptRows.length === 0) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
  const attempt = attemptRows[0];
  if (attempt.status === 'COMPLETED') return false;
  if (attempt.status !== 'IN_PROGRESS') {
    throw new AppError(409, 'This interview was abandoned and can no longer be completed', 'ATTEMPT_ABANDONED');
  }

  const client: PoolClient = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE assessment.assessment_attempts
       SET status='COMPLETED', completed_at=now() WHERE id=$1`,
      [attemptId]
    );
    await client.query(
      `INSERT INTO performance.assessment_reports
         (attempt_id, student_id, assessment_version, scoring_version,
          technical_score, communication_score, listening_score, overall_score,
          component_scores, skill_scores)
       VALUES ($1,$2,1,'v1.0',$3,$4,$5,$6,$7,NULL)
       ON CONFLICT (attempt_id) DO UPDATE
         SET technical_score=$3, communication_score=$4,
             listening_score=$5, overall_score=$6`,
      [
        attemptId,
        attempt.student_id,
        scores.technicalScore,
        scores.communicationScore,
        scores.listeningScore,
        scores.overallScore,
        JSON.stringify(componentScores ?? {
          TECHNICAL: scores.technicalScore,
          COMMUNICATION: scores.communicationScore,
          LISTENING: scores.listeningScore,
        }),
      ]
    );
    await client.query(
      `UPDATE session.assessment_sessions SET state='COMPLETED', last_activity_at=now() WHERE id=$1`,
      [sessionId]
    );
    await client.query(
      `UPDATE session.interview_sessions
       SET status='completed', overall_score=$1, ended_at=now(), updated_at=now()
       WHERE id=$2`,
      [scores.overallScore, sessionId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Module 3 updates performance data and triggers the learning-plan agent
  const payload: AttemptCompletedPayload = {
    attemptId,
    studentId: attempt.student_id,
    programId: attempt.program_id,
    batchId: attempt.batch_id,
    subdivisionId: attempt.subdivision_id,
    overallScore: scores.overallScore,
    technicalScore: scores.technicalScore,
    communicationScore: scores.communicationScore,
    listeningScore: scores.listeningScore,
    goal,
  };
  eventBus.emit(Events.ATTEMPT_COMPLETED, payload);
  return true;
}

// Concludes a live interview with the report built from the server's own per-turn results.
export async function concludeLiveInterview(
  sessionId: string,
  attemptId: string,
  report: InterviewReport,
): Promise<void> {
  await completeAttempt(
    sessionId,
    attemptId,
    {
      overallScore: report.overallScore,
      technicalScore: report.technicalScore,
      communicationScore: report.communicationScore,
      listeningScore: null,
    },
    'Improve technical skills, communication skills, and interview readiness',
    {
      TECHNICAL: report.technicalScore,
      COMMUNICATION: report.communicationScore,
      LISTENING: null,
      FLUENCY: report.fluencyScore,
      CLARITY: report.clarityScore,
      AVERAGE_WPM: report.averageWpm || null,
      FILLER_WORDS: report.totalFillerWords,
      TAB_SWITCHES: report.tabSwitches,
      QUESTIONS_ANSWERED: report.questionsAnswered,
    },
  );
}

// Ends a live interview without a result (proctoring disqualification, or time ran
// out before anything was answered): the attempt is ABANDONED and earns nothing.
export async function terminateLiveInterview(sessionId: string, attemptId: string): Promise<void> {
  const client: PoolClient = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE assessment.assessment_attempts SET status = 'ABANDONED', completed_at = now()
       WHERE id = $1 AND status = 'IN_PROGRESS'`,
      [attemptId]
    );
    await client.query(
      `UPDATE session.assessment_sessions SET state = 'TERMINATED', last_activity_at = now() WHERE id = $1`,
      [sessionId]
    );
    await client.query(
      `UPDATE session.interview_sessions SET status = 'terminated', ended_at = now(), updated_at = now() WHERE id = $1`,
      [sessionId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
