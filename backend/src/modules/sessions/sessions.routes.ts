import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { env } from '../../config/env';

export const sessionsRouter = Router();

interface SessionStateData {
  tab_switch_count: number;
  fullscreen_exit_count: number;
  is_proctor_flagged: boolean;
  replay_count: number;
  session_type: string;
}

function defaultStateData(sessionType: string): SessionStateData {
  return {
    tab_switch_count: 0,
    fullscreen_exit_count: 0,
    is_proctor_flagged: false,
    replay_count: 0,
    session_type: sessionType,
  };
}

async function getNextQuestion(attemptId: string, nextSeq: number, difficulty: string, studentName: string) {
  const { rows: bankQ } = await db.query(
    `SELECT id, question_text, difficulty FROM session.question_bank_items
     WHERE is_active = true AND difficulty = $1
     AND id NOT IN (
       SELECT question_bank_item_id FROM session.questions
       WHERE attempt_id = $2 AND question_bank_item_id IS NOT NULL
     )
     ORDER BY random()
     LIMIT 1`,
    [difficulty, attemptId]
  );

  if (bankQ.length > 0) {
    const { rows: q } = await db.query(
      `INSERT INTO session.questions
         (attempt_id, question_bank_item_id, question_text, difficulty, sequence_no, question_type, is_generated)
       VALUES ($1, $2, $3, $4, $5, 'INTERVIEW', false)
       RETURNING id, question_text, difficulty, sequence_no`,
      [attemptId, bankQ[0].id, bankQ[0].question_text, bankQ[0].difficulty, nextSeq]
    );
    return q[0];
  }

  // No bank question available — try AI generation (ai-client handles unreachable)
  const { generateQuestion } = await import('../evaluation/ai-client');
  const aiResult = await generateQuestion({
    student_name: studentName,
    difficulty: difficulty as 'EASY' | 'MEDIUM' | 'ADVANCED',
    previous_turns: [],
  });

  if (aiResult.unreachable || !aiResult.question_text) return null;

  const { rows: q } = await db.query(
    `INSERT INTO session.questions
       (attempt_id, question_text, difficulty, sequence_no, question_type, is_generated)
     VALUES ($1, $2, $3, $4, 'INTERVIEW', true)
     RETURNING id, question_text, difficulty, sequence_no`,
    [attemptId, aiResult.question_text, difficulty, nextSeq]
  );
  return q[0];
}

// POST /api/sessions/start
sessionsRouter.post(
  '/start',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = z.object({
        attemptId: z.string().uuid(),
        sessionType: z.string().default('MOCK_INTERVIEW'),
      }).safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { attemptId, sessionType } = parsed.data;
      const userId = req.user!.id;

      // Verify ownership — also fetch student name for AI question generation
      const { rows: attemptRows } = await db.query(
        `SELECT a.id, a.status, a.assessment_id, s.user_id AS student_user_id, u.name AS student_name
         FROM assessment.assessment_attempts a
         JOIN org.students s ON s.id = a.student_id
         JOIN identity.users u ON u.id = s.user_id
         WHERE a.id = $1`,
        [attemptId]
      );
      if (attemptRows.length === 0) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
      const attempt = attemptRows[0];
      if (attempt.student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      if (attempt.status !== 'IN_PROGRESS') {
        throw new AppError(409, 'Attempt is not in progress', 'INVALID_STATUS');
      }

      // Check if session already exists
      const { rows: existing } = await db.query(
        'SELECT id, state FROM session.assessment_sessions WHERE attempt_id = $1',
        [attemptId]
      );
      if (existing.length > 0) {
        if (existing[0].state === 'ACTIVE') {
          throw new AppError(409, 'Session already active for this attempt', 'SESSION_ALREADY_ACTIVE');
        }
        if (existing[0].state === 'COMPLETED') {
          throw new AppError(409, 'Session already completed', 'SESSION_ALREADY_COMPLETED');
        }
        if (existing[0].state === 'TERMINATED') {
          throw new AppError(409, 'Session was terminated due to proctoring violations', 'SESSION_TERMINATED');
        }
        // Resume existing session (only PAUSED or INITIALIZED-retry reaches here)
        const { rows: sessionRows } = await db.query(
          `UPDATE session.assessment_sessions
           SET state = 'ACTIVE', last_activity_at = now(), updated_at = now()
           WHERE attempt_id = $1
           RETURNING id, state, current_sequence_no, state_data`,
          [attemptId]
        );
        const session = sessionRows[0];
        const nextSeq = session.current_sequence_no + 1;

        const { rows: currentQ } = await db.query(
          `SELECT id, question_text, difficulty FROM session.questions
           WHERE attempt_id = $1 AND sequence_no = $2`,
          [attemptId, session.current_sequence_no || 1]
        );

        sendSuccess(res, {
          sessionId: session.id,
          status: session.state,
          firstQuestion: currentQ.length > 0 ? {
            questionId: currentQ[0].id,
            questionText: currentQ[0].question_text,
            difficulty: currentQ[0].difficulty,
          } : null,
        }, 201);
        return;
      }

      // Create new session and first question
      const stateData = defaultStateData(sessionType);
      const { rows: sessionRows } = await db.query(
        `INSERT INTO session.assessment_sessions
           (attempt_id, current_sequence_no, state, state_data, last_activity_at)
         VALUES ($1, 1, 'ACTIVE', $2, now())
         RETURNING id, state, current_sequence_no`,
        [attemptId, JSON.stringify(stateData)]
      );
      const session = sessionRows[0];

      const question = await getNextQuestion(attemptId, 1, 'EASY', attempt.student_name);
      if (!question) {
        // No question available — fail gracefully
        await db.query(
          `UPDATE session.assessment_sessions SET state = 'INITIALIZED', updated_at = now()
           WHERE id = $1`,
          [session.id]
        );
        throw new AppError(503, 'No questions available and AI service unreachable', 'NO_QUESTIONS');
      }

      sendSuccess(res, {
        sessionId: session.id,
        status: session.state,
        firstQuestion: {
          questionId: question.id,
          questionText: question.question_text,
          difficulty: question.difficulty,
        },
      }, 201);
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/sessions/:id
sessionsRouter.get(
  '/:id',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const { rows } = await db.query(
        `SELECT ses.id, ses.attempt_id, ses.current_sequence_no, ses.state, ses.state_data,
                ses.last_activity_at, ses.expires_at, ses.created_at,
                s.user_id AS student_user_id
         FROM session.assessment_sessions ses
         JOIN assessment.assessment_attempts a ON a.id = ses.attempt_id
         JOIN org.students s ON s.id = a.student_id
         WHERE ses.id = $1`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Session not found', 'NOT_FOUND');

      const session = rows[0];
      if (session.student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');

      // Get current question
      const { rows: currentQ } = await db.query(
        `SELECT id, question_text, difficulty, sequence_no
         FROM session.questions
         WHERE attempt_id = $1 AND sequence_no = $2`,
        [session.attempt_id, session.current_sequence_no]
      );

      sendSuccess(res, {
        session: {
          id: session.id,
          attemptId: session.attempt_id,
          state: session.state,
          currentSequenceNo: session.current_sequence_no,
          stateData: session.state_data,
          lastActivityAt: session.last_activity_at,
        },
        currentQuestion: currentQ.length > 0 ? {
          questionId: currentQ[0].id,
          questionText: currentQ[0].question_text,
          difficulty: currentQ[0].difficulty,
          sequenceNo: currentQ[0].sequence_no,
        } : null,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/sessions/:id/proctor-event
sessionsRouter.post(
  '/:id/proctor-event',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const proctorSchema = z.object({
        eventType: z.enum(['TAB_SWITCH', 'FOCUS_LOST']),
        timestamp: z.string().optional(),
      });
      const parsed = proctorSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');

      const { rows } = await db.query(
        `SELECT ses.id, ses.state, ses.state_data, ses.attempt_id, s.user_id AS student_user_id
         FROM session.assessment_sessions ses
         JOIN assessment.assessment_attempts a ON a.id = ses.attempt_id
         JOIN org.students s ON s.id = a.student_id
         WHERE ses.id = $1`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Session not found', 'NOT_FOUND');
      const session = rows[0];
      if (session.student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      if (session.state !== 'ACTIVE') throw new AppError(409, 'Session is not active', 'INVALID_STATUS');

      const stateData: SessionStateData = session.state_data ?? defaultStateData('MOCK_INTERVIEW');
      const maxLimit = env.MAX_TAB_SWITCH_LIMIT;

      if (parsed.data.eventType === 'TAB_SWITCH') {
        stateData.tab_switch_count += 1;
      } else {
        stateData.fullscreen_exit_count += 1;
      }

      if (stateData.tab_switch_count >= maxLimit) {
        stateData.is_proctor_flagged = true;
      }

      let newState = session.state;
      if (stateData.is_proctor_flagged && stateData.tab_switch_count > maxLimit + 1) {
        newState = 'TERMINATED';
      }

      await db.query(
        `UPDATE session.assessment_sessions
         SET state_data = $1, state = $2, last_activity_at = now(), updated_at = now()
         WHERE id = $3`,
        [JSON.stringify(stateData), newState, id]
      );

      // B5: when session is terminated by proctoring, also abandon the attempt
      if (newState === 'TERMINATED') {
        await db.query(
          `UPDATE assessment.assessment_attempts
           SET status = 'ABANDONED', completed_at = now()
           WHERE id = $1 AND status = 'IN_PROGRESS'`,
          [session.attempt_id]
        );
      }

      // Write audit log for 3-4 switches (warning level)
      if (stateData.tab_switch_count >= 3 && stateData.tab_switch_count <= 4) {
        await db.query(
          `INSERT INTO system.audit_logs (user_id, action, resource_type, resource_id)
           VALUES ($1, 'PROCTORING_WARNING', 'assessment_sessions', $2)`,
          [userId, id]
        );
      }

      let warning: string | null = null;
      if (!stateData.is_proctor_flagged && stateData.tab_switch_count >= 3) {
        warning = `${stateData.tab_switch_count} tab switches detected — further switching may flag your assessment`;
      }

      sendSuccess(res, {
        tabSwitchCount: stateData.tab_switch_count,
        isFlagged: stateData.is_proctor_flagged,
        sessionState: newState,
        warning,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// POST /api/sessions/:id/complete — triggers report generation
sessionsRouter.post(
  '/:id/complete',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const userId = req.user!.id;

      const { rows } = await db.query(
        `SELECT ses.id, ses.attempt_id, ses.state, ses.state_data,
                a.student_id, a.assessment_id, a.assessment_version,
                s.user_id AS student_user_id,
                asmt.assessment_type
         FROM session.assessment_sessions ses
         JOIN assessment.assessment_attempts a ON a.id = ses.attempt_id
         JOIN org.students s ON s.id = a.student_id
         JOIN assessment.assessments asmt ON asmt.id = a.assessment_id
         WHERE ses.id = $1`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Session not found', 'NOT_FOUND');
      const session = rows[0];
      if (session.student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      if (session.state !== 'ACTIVE') throw new AppError(409, 'Session is not active', 'INVALID_STATUS');

      // Aggregate all evaluations for this attempt
      const { rows: evals } = await db.query(
        `SELECT re.technical_score, re.communication_score,
                re.strengths, re.weaknesses, re.feedback, re.communication_metrics
         FROM evaluation.response_evaluations re
         JOIN evaluation.responses r ON r.id = re.response_id
         WHERE r.attempt_id = $1`,
        [session.attempt_id]
      );

      const totalQ = evals.length;
      if (totalQ === 0) throw new AppError(422, 'No responses submitted', 'NO_RESPONSES');

      const techAvg = evals.reduce((sum, e) => sum + (Number(e.technical_score) || 0), 0) / totalQ;
      const commAvg = evals.reduce((sum, e) => sum + (Number(e.communication_score) || 0), 0) / totalQ;
      const overall = Math.round((techAvg * 0.70 + commAvg * 0.30) * 100) / 100;
      const stateData: SessionStateData = session.state_data ?? defaultStateData('MOCK_INTERVIEW');

      const componentScores = {
        technical_avg: Math.round(techAvg * 100) / 100,
        communication_avg: Math.round(commAvg * 100) / 100,
        total_questions: totalQ,
        tab_switch_count: stateData.tab_switch_count,
        is_proctor_flagged: stateData.is_proctor_flagged,
      };

      // Aggregate strengths/weaknesses (combine from all evals)
      const allStrengths = evals.flatMap(e => {
        if (!e.strengths) return [];
        if (Array.isArray(e.strengths)) return e.strengths as string[];
        if (typeof e.strengths === 'string') return [e.strengths];
        return [];
      });
      const allWeaknesses = evals.flatMap(e => {
        if (!e.weaknesses) return [];
        if (Array.isArray(e.weaknesses)) return e.weaknesses as string[];
        if (typeof e.weaknesses === 'string') return [e.weaknesses];
        return [];
      });
      const allFeedback = evals.map(e => e.feedback).filter(Boolean).join(' ');

      // Write immutable assessment report
      const { rows: reportRows } = await db.query(
        `INSERT INTO performance.assessment_reports
           (attempt_id, student_id, assessment_version, scoring_version,
            technical_score, communication_score, overall_score,
            component_scores, strengths, weaknesses, feedback)
         VALUES ($1, $2, $3, '1.0', $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (attempt_id) DO NOTHING
         RETURNING id`,
        [
          session.attempt_id,
          session.student_id,
          session.assessment_version,
          Math.round(techAvg * 100) / 100,
          Math.round(commAvg * 100) / 100,
          overall,
          JSON.stringify(componentScores),
          JSON.stringify(allStrengths),
          JSON.stringify(allWeaknesses),
          allFeedback || null,
        ]
      );

      // Mark session COMPLETED and attempt COMPLETED
      await db.query(
        `UPDATE session.assessment_sessions
         SET state = 'COMPLETED', updated_at = now()
         WHERE id = $1`,
        [id]
      );
      await db.query(
        `UPDATE assessment.assessment_attempts
         SET status = 'COMPLETED', completed_at = now()
         WHERE id = $1`,
        [session.attempt_id]
      );

      // Emit ATTEMPT_COMPLETED event after response sent — fire and forget
      const { eventBus } = await import('../../shared/events/eventBus');
      const { Events } = await import('../../shared/events/events');
      setImmediate(() => {
        eventBus.emit(Events.ATTEMPT_COMPLETED, {
          attemptId: session.attempt_id,
          assessmentId: session.assessment_id,
          studentId: session.student_id,
          assessmentType: session.assessment_type,
          technicalScore: Math.round(techAvg * 100) / 100,
          communicationScore: Math.round(commAvg * 100) / 100,
          overallScore: overall,
          reportId: reportRows[0]?.id ?? null,
        });
      });

      sendSuccess(res, {
        reportId: reportRows[0]?.id ?? null,
        overallScore: overall,
        technicalScore: Math.round(techAvg * 100) / 100,
        communicationScore: Math.round(commAvg * 100) / 100,
        totalQuestions: totalQ,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);
