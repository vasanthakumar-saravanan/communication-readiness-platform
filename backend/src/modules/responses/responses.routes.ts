import { Router, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';
import { requireRole } from '../../middleware/authorize';
import { evaluateResponse } from '../evaluation/ai-client';
import { roundScore } from '../evaluation/scoring';
import { env } from '../../config/env';

export const responsesRouter = Router();

const submitSchema = z.object({
  attemptId: z.string().uuid(),
  questionId: z.string().uuid(),
  transcript: z.string().min(1),
  inputType: z.enum(['VOICE', 'TEXT', 'MIXED']).default('TEXT'),
  idempotencyKey: z.string().max(100).optional(),
  durationSec: z.number().int().min(1).optional(),
});

// POST /api/responses/submit
responsesRouter.post(
  '/submit',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = submitSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { attemptId, questionId, transcript, inputType, durationSec } = parsed.data;
      const idempotencyKey = parsed.data.idempotencyKey ?? randomUUID();
      const userId = req.user!.id;

      // Verify student owns the attempt
      const { rows: attemptRows } = await db.query(
        `SELECT a.id, a.status, s.user_id AS student_user_id
         FROM assessment.assessment_attempts a
         JOIN org.students s ON s.id = a.student_id
         WHERE a.id = $1`,
        [attemptId]
      );
      if (attemptRows.length === 0) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
      if (attemptRows[0].student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      if (attemptRows[0].status !== 'IN_PROGRESS') {
        throw new AppError(409, 'Attempt is not in progress', 'INVALID_STATUS');
      }

      // Verify question belongs to attempt
      const { rows: questionRows } = await db.query(
        `SELECT id, question_text, difficulty, sequence_no
         FROM session.questions WHERE id = $1 AND attempt_id = $2`,
        [questionId, attemptId]
      );
      if (questionRows.length === 0) throw new AppError(404, 'Question not found for this attempt', 'NOT_FOUND');
      const question = questionRows[0];

      // Check session state
      const { rows: sessionRows } = await db.query(
        `SELECT id, state FROM session.assessment_sessions WHERE attempt_id = $1`,
        [attemptId]
      );
      if (sessionRows.length === 0) throw new AppError(409, 'No session found — start session first', 'NO_SESSION');
      if (sessionRows[0].state !== 'ACTIVE') throw new AppError(409, 'Session is not active', 'INVALID_STATUS');

      // Check for duplicate response (idempotency)
      const { rows: dupCheck } = await db.query(
        'SELECT id FROM evaluation.responses WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (dupCheck.length > 0) {
        // Return existing evaluation
        const { rows: existingEval } = await db.query(
          `SELECT re.id, re.technical_score, re.communication_score, re.feedback,
                  re.strengths, re.weaknesses
           FROM evaluation.response_evaluations re
           WHERE re.response_id = $1`,
          [dupCheck[0].id]
        );
        sendSuccess(res, { evaluationId: existingEval[0]?.id, duplicate: true });
        return;
      }

      // Save response
      const { rows: responseRows } = await db.query(
        `INSERT INTO evaluation.responses
           (attempt_id, question_id, input_type, transcript, idempotency_key)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [attemptId, questionId, inputType, transcript, idempotencyKey]
      );
      const responseId = responseRows[0].id;

      // Write ai_runs record first (PENDING) so we always have a record
      const { rows: aiRunRows } = await db.query(
        `INSERT INTO evaluation.ai_runs
           (response_id, capability, status)
         VALUES ($1, 'EVALUATE_RESPONSE', 'PENDING')
         RETURNING id`,
        [responseId]
      );
      const aiRunId = aiRunRows[0].id;

      // Call FastAPI for evaluation
      const aiStart = Date.now();
      const aiResult = await evaluateResponse({
        student_answer: transcript,
        question_text: question.question_text,
        difficulty: question.difficulty as 'EASY' | 'MEDIUM' | 'ADVANCED',
        turn_number: question.sequence_no,
      });
      const latencyMs = Date.now() - aiStart;

      let techScore: number;
      let commScore: number;
      let communicationMetrics: object;

      if (aiResult.unreachable) {
        // AI service unreachable — store PENDING, return 503
        await db.query(
          `UPDATE evaluation.ai_runs
           SET status = 'FAILED', latency_ms = $1, error_code = 'AI_UNREACHABLE',
               error_message = 'FastAPI service unreachable', completed_at = now()
           WHERE id = $2`,
          [latencyMs, aiRunId]
        );
        res.status(503).json({
          status: 'error',
          code: 'AI_UNAVAILABLE',
          message: 'AI evaluation service is currently unavailable. Response saved.',
          responseId,
        });
        return;
      }

      // FastAPI returns scores on 0–10 scale; ai-client normalizes them to 0–100.
      techScore = roundScore(aiResult.technical_score);
      commScore = roundScore(aiResult.communication_score);

      communicationMetrics = {
        wpm: aiResult.wpm,
        filler_count: aiResult.filler_count,
        next_recommended_difficulty: aiResult.next_recommended_difficulty,
      };

      // Update ai_runs to COMPLETED
      await db.query(
        `UPDATE evaluation.ai_runs
         SET status = 'COMPLETED', model = $1, latency_ms = $2,
             response_metadata = $3, completed_at = now()
         WHERE id = $4`,
        [
          aiResult.model_used,
          latencyMs,
          JSON.stringify({ raw: aiResult }),
          aiRunId,
        ]
      );

      // Save evaluation
      const { rows: evalRows } = await db.query(
        `INSERT INTO evaluation.response_evaluations
           (response_id, ai_run_id, technical_score, communication_score,
            communication_metrics, dimension_scores, feedback, strengths, weaknesses,
            evaluation_version)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, '1.0')
         RETURNING id`,
        [
          responseId,
          aiRunId,
          techScore,
          commScore,
          JSON.stringify(communicationMetrics),
          JSON.stringify({ technical: techScore, communication: commScore }),
          aiResult.feedback || null,
          JSON.stringify([aiResult.strengths].filter(Boolean)),
          JSON.stringify([aiResult.weaknesses].filter(Boolean)),
        ]
      );
      const evaluationId = evalRows[0].id;

      // Determine next question
      const maxQ = env.MAX_QUESTIONS_PER_SESSION;
      const nextSeq = question.sequence_no + 1;

      let nextQuestion: { questionId: string; questionText: string; difficulty: string } | null = null;
      if (nextSeq <= maxQ) {
        // Determine next difficulty (simple adaptive: >=80 → harder, <50 → easier)
        let nextDiff: 'EASY' | 'MEDIUM' | 'ADVANCED' = question.difficulty as 'EASY' | 'MEDIUM' | 'ADVANCED';
        if (techScore >= 80 && question.difficulty === 'EASY') nextDiff = 'MEDIUM';
        else if (techScore >= 80 && question.difficulty === 'MEDIUM') nextDiff = 'ADVANCED';
        else if (techScore < 50 && question.difficulty === 'ADVANCED') nextDiff = 'MEDIUM';
        else if (techScore < 50 && question.difficulty === 'MEDIUM') nextDiff = 'EASY';

        // Check if next question already created (e.g., if resubmit)
        const { rows: existingNext } = await db.query(
          'SELECT id, question_text, difficulty FROM session.questions WHERE attempt_id = $1 AND sequence_no = $2',
          [attemptId, nextSeq]
        );

        if (existingNext.length > 0) {
          nextQuestion = {
            questionId: existingNext[0].id,
            questionText: existingNext[0].question_text,
            difficulty: existingNext[0].difficulty,
          };
        } else {
          const { rows: bankQ } = await db.query(
            `SELECT id, question_text, difficulty FROM session.question_bank_items
             WHERE is_active = true AND difficulty = $1
             AND id NOT IN (
               SELECT question_bank_item_id FROM session.questions
               WHERE attempt_id = $2 AND question_bank_item_id IS NOT NULL
             )
             ORDER BY random() LIMIT 1`,
            [nextDiff, attemptId]
          );

          if (bankQ.length > 0) {
            const { rows: newQ } = await db.query(
              `INSERT INTO session.questions
                 (attempt_id, question_bank_item_id, question_text, difficulty, sequence_no, question_type)
               VALUES ($1, $2, $3, $4, $5, 'INTERVIEW')
               RETURNING id, question_text, difficulty`,
              [attemptId, bankQ[0].id, bankQ[0].question_text, bankQ[0].difficulty, nextSeq]
            );
            nextQuestion = {
              questionId: newQ[0].id,
              questionText: newQ[0].question_text,
              difficulty: newQ[0].difficulty,
            };
          }
        }
      }

      // Update session's current_sequence_no
      if (nextQuestion) {
        await db.query(
          `UPDATE session.assessment_sessions
           SET current_sequence_no = $1, last_activity_at = now(), updated_at = now()
           WHERE attempt_id = $2`,
          [nextSeq, attemptId]
        );
      }

      sendSuccess(res, {
        evaluationId,
        technicalScore: techScore,
        communicationScore: commScore,
        feedback: aiResult.feedback,
        strengths: aiResult.strengths,
        weaknesses: aiResult.weaknesses,
        nextQuestion,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

// GET /api/responses/:id
responsesRouter.get(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const user = req.user!;

      const { rows } = await db.query(
        `SELECT r.id, r.attempt_id, r.question_id, r.input_type, r.transcript,
                r.submitted_at,
                s.id AS student_id, s.user_id AS student_user_id,
                re.id AS eval_id, re.technical_score, re.communication_score,
                re.feedback, re.strengths, re.weaknesses, re.communication_metrics
         FROM evaluation.responses r
         JOIN assessment.assessment_attempts a ON a.id = r.attempt_id
         JOIN org.students s ON s.id = a.student_id
         LEFT JOIN evaluation.response_evaluations re ON re.response_id = r.id
         WHERE r.id = $1`,
        [id]
      );
      if (rows.length === 0) throw new AppError(404, 'Response not found', 'NOT_FOUND');

      const row = rows[0];

      if (user.role === 'STUDENT' && row.student_user_id !== user.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }
      if (user.role === 'FACULTY_MENTOR') {
        const { rows: assigned } = await db.query(
          `SELECT id FROM org.student_mentor_assignments
           WHERE student_id = $1 AND mentor_id = $2 AND is_active = true`,
          [row.student_id, user.id]
        );
        if (assigned.length === 0) throw new AppError(403, 'Not assigned to this student', 'FORBIDDEN');
      }

      sendSuccess(res, {
        response: {
          id: row.id,
          attemptId: row.attempt_id,
          questionId: row.question_id,
          inputType: row.input_type,
          transcript: row.transcript,
          submittedAt: row.submitted_at,
        },
        evaluation: row.eval_id ? {
          id: row.eval_id,
          technicalScore: row.technical_score,
          communicationScore: row.communication_score,
          feedback: row.feedback,
          strengths: row.strengths,
          weaknesses: row.weaknesses,
          communicationMetrics: row.communication_metrics,
        } : null,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);
