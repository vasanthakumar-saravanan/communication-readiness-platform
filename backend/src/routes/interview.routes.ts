import { Router, Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { authenticate, AuthRequest } from '../middleware/authenticate';
import { requireRole } from '../middleware/authorize';
import { env } from '../config/env';
import { sessionContextService } from '../services/sessionContextService';

export const interviewRouter = Router();

const audioUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.UPLOAD_MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) {
      cb(null, true);
    } else {
      cb(new Error('Audio files only'));
    }
  },
});

const BankFallbackQuerySchema = z.object({
  difficulty: z.enum(['EASY', 'MEDIUM', 'ADVANCED']).default('EASY'),
  domain: z.string().optional(),
  sessionId: z.string().uuid(),
});

// GET /api/sessions/bank-fallback?sessionId=<uuid>&difficulty=EASY
// B-QBANK-NAME FIX: queries session.question_bank_items (correct table).
// Also inserts into session.questions so audio turns can link response_id back.
interviewRouter.get(
  '/bank-fallback',
  authenticate,
  requireRole('STUDENT'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const parsed = BankFallbackQuerySchema.safeParse(req.query);
      if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
      const { difficulty, domain, sessionId } = parsed.data;
      const userId = req.user!.id;

      // Verify session ownership and fetch context
      const { rows: sessionRows } = await db.query(
        `SELECT ses.id, ses.attempt_id, ses.state, ses.current_sequence_no,
                s.user_id AS student_user_id
         FROM session.assessment_sessions ses
         JOIN assessment.assessment_attempts a ON a.id = ses.attempt_id
         JOIN org.students s ON s.id = a.student_id
         WHERE ses.id = $1`,
        [sessionId]
      );
      if (sessionRows.length === 0) throw new AppError(404, 'Session not found', 'NOT_FOUND');
      const session = sessionRows[0];
      if (session.student_user_id !== userId) throw new AppError(403, 'Access denied', 'FORBIDDEN');
      if (session.state !== 'ACTIVE') throw new AppError(409, 'Session is not active', 'INVALID_STATUS');

      // The next sequence number is current + 1 (session starts at 0 after /sessions/start sets 1)
      const nextSeq = (session.current_sequence_no as number) + 1;

      // If a question already exists for this sequence, return it
      const { rows: existing } = await db.query(
        `SELECT id, question_text, difficulty, sequence_no
         FROM session.questions
         WHERE attempt_id = $1 AND sequence_no = $2`,
        [session.attempt_id, nextSeq]
      );
      if (existing.length > 0) {
        sendSuccess(res, {
          questionId: existing[0].id,
          questionText: existing[0].question_text,
          difficulty: existing[0].difficulty,
          sequenceNo: existing[0].sequence_no,
          source: 'existing',
        });
        return;
      }

      // B-QBANK-NAME FIX: query session.question_bank_items, filter domain via metadata JSONB
      const { rows: bankQ } = await db.query(
        `SELECT id, question_text, difficulty,
                metadata->>'category' AS category,
                metadata->>'domain'   AS domain
         FROM session.question_bank_items
         WHERE is_active = true
           AND difficulty = $1
           AND ($2::text IS NULL OR metadata->>'domain' = $2)
           AND id NOT IN (
             SELECT question_bank_item_id FROM session.questions
             WHERE attempt_id = $3 AND question_bank_item_id IS NOT NULL
           )
         ORDER BY random()
         LIMIT 1`,
        [difficulty, domain ?? null, session.attempt_id]
      ).catch(() => ({ rows: [] as Record<string, string>[] }));

      if (bankQ.length > 0) {
        const { rows: inserted } = await db.query(
          `INSERT INTO session.questions
             (attempt_id, question_bank_item_id, question_text, difficulty, sequence_no,
              question_type, is_generated)
           VALUES ($1, $2, $3, $4, $5, 'INTERVIEW', false)
           ON CONFLICT (attempt_id, sequence_no) DO UPDATE
             SET question_text = EXCLUDED.question_text
           RETURNING id, question_text, difficulty, sequence_no`,
          [session.attempt_id, bankQ[0].id, bankQ[0].question_text, bankQ[0].difficulty, nextSeq]
        );
        sendSuccess(res, {
          questionId: inserted[0].id,
          questionText: inserted[0].question_text,
          difficulty: inserted[0].difficulty,
          sequenceNo: inserted[0].sequence_no,
          source: 'bank',
        });
        return;
      }

      // No bank match — static fallback (question not inserted into session.questions;
      // caller must use /responses/submit which handles bank-less questions via AI generation)
      sendSuccess(res, {
        questionId: null,
        questionText: 'Tell me about a challenging project you have worked on and how you resolved it.',
        difficulty,
        sequenceNo: nextSeq,
        source: 'static',
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);

const TurnMetadataSchema = z.object({
  turn_number: z.number().int().min(1),
  question_id: z.string().uuid().optional(),
  idempotency_key: z.string().max(100).optional(),
});

// POST /api/sessions/:id/turns  (multipart/form-data: audio file + metadata JSON field)
//
// B-TURNS-NO-AUTH FIX:  authenticate middleware is placed BEFORE audioUpload so the
//   student identity comes from the verified JWT (req.user.id), never from request body.
//   Session ownership is also verified against the authenticated user.
//
// B-RESPONSE-SPLIT FIX: after FastAPI audio evaluation, writes a row into
//   evaluation.responses + evaluation.response_evaluations so M2's
//   POST /sessions/:id/complete handler can aggregate scores normally.
interviewRouter.post(
  '/:id/turns',
  authenticate,                     // B-TURNS-NO-AUTH FIX: auth before file upload
  requireRole('STUDENT'),
  audioUpload.single('audio'),
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      // req.params.id is string in Express v4 types; assert to satisfy strict compiler
      const sessionId = req.params.id as string;
      const userId = req.user!.id;   // B-TURNS-NO-AUTH FIX: from verified JWT

      // Parse metadata from multipart body field
      const metadataRaw = req.body?.metadata as string | undefined;
      if (!metadataRaw) throw new AppError(422, 'Missing metadata field', 'VALIDATION_ERROR');
      let meta: z.infer<typeof TurnMetadataSchema>;
      try {
        meta = TurnMetadataSchema.parse(JSON.parse(metadataRaw));
      } catch {
        throw new AppError(422, 'Invalid metadata JSON', 'VALIDATION_ERROR');
      }

      if (!req.file) throw new AppError(422, 'Audio file required', 'VALIDATION_ERROR');

      // B-TURNS-NO-AUTH FIX: verify session ownership + active state via DB
      const { rows: sessionRows } = await db.query(
        `SELECT ses.id, ses.attempt_id, ses.state, ses.current_sequence_no,
                a.student_id,
                s.user_id AS student_user_id
         FROM session.assessment_sessions ses
         JOIN assessment.assessment_attempts a ON a.id = ses.attempt_id
         JOIN org.students s ON s.id = a.student_id
         WHERE ses.id = $1`,
        [sessionId]
      );
      if (sessionRows.length === 0) throw new AppError(404, 'Session not found', 'NOT_FOUND');
      const session = sessionRows[0];
      if (session.student_user_id !== userId) {     // B-TURNS-NO-AUTH FIX
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }
      if (session.state !== 'ACTIVE') {
        throw new AppError(409, 'Session is not active', 'INVALID_STATUS');
      }

      // Resolve question_id — prefer explicit, fall back to current sequence
      const turnSeq = meta.turn_number;
      let questionId = meta.question_id ?? null;

      if (!questionId) {
        const { rows: qRows } = await db.query(
          `SELECT id FROM session.questions
           WHERE attempt_id = $1 AND sequence_no = $2`,
          [session.attempt_id, turnSeq]
        );
        if (qRows.length === 0) {
          throw new AppError(
            422,
            'No question found for turn — call GET /sessions/bank-fallback first',
            'NO_QUESTION'
          );
        }
        questionId = qRows[0].id as string;
      }

      const idempotencyKey = meta.idempotency_key ?? `${sessionId}:turn:${turnSeq}`;

      // Idempotency guard
      const { rows: dupCheck } = await db.query(
        'SELECT id FROM evaluation.responses WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (dupCheck.length > 0) {
        sendSuccess(res, { responseId: dupCheck[0].id as string, duplicate: true });
        return;
      }

      // Forward audio to FastAPI /ai/evaluate-response
      let transcript = '';
      let techScore = 0;
      let commScore = 0;
      let wpm = 0;
      let fillerCount = 0;
      let aiReachable = true;
      const aiStart = Date.now();

      try {
        const fd = new FormData();
        fd.append('audio', req.file.buffer, {
          filename: req.file.originalname || 'audio.webm',
          contentType: req.file.mimetype,
        });
        const aiResp = await axios.post<{
          transcript?: string;
          technical_score?: number;
          communication_score?: number;
          wpm?: number;
          filler_words?: number;
          filler_count?: number;
        }>(`${env.AI_SERVICE_URL}/ai/evaluate-response`, fd, {
          headers: fd.getHeaders(),
          timeout: 60_000,
        });
        const d = aiResp.data;
        transcript = d.transcript ?? '';
        // B-CLAMP applied: FastAPI returns 0–10, normalize to 0–100
        techScore = Math.min(100, Math.max(0, Math.round((d.technical_score ?? 0) * 10 * 100) / 100));
        commScore = Math.min(100, Math.max(0, Math.round((d.communication_score ?? 0) * 10 * 100) / 100));
        wpm = d.wpm ?? 0;
        fillerCount = d.filler_words ?? d.filler_count ?? 0;
      } catch {
        aiReachable = false;
      }
      const latencyMs = Date.now() - aiStart;

      // B-RESPONSE-SPLIT FIX: persist to M2 evaluation tables so the complete
      // handler's AVG query over evaluation.response_evaluations finds these rows.

      // 1. evaluation.responses
      const { rows: responseRows } = await db.query(
        `INSERT INTO evaluation.responses
           (attempt_id, question_id, input_type, transcript, idempotency_key)
         VALUES ($1, $2, 'VOICE', $3, $4)
         RETURNING id`,
        [session.attempt_id, questionId, transcript || null, idempotencyKey]
      );
      const responseId = responseRows[0].id as string;

      // 2. evaluation.ai_runs
      const { rows: aiRunRows } = await db.query(
        `INSERT INTO evaluation.ai_runs
           (response_id, capability, provider, status, latency_ms, completed_at)
         VALUES ($1, 'EVALUATE_AUDIO_RESPONSE', 'fastapi', $2, $3, now())
         RETURNING id`,
        [responseId, aiReachable ? 'COMPLETED' : 'FAILED', latencyMs]
      );
      const aiRunId = aiRunRows[0].id as string;

      // 3. evaluation.response_evaluations (only when AI returned scores)
      if (aiReachable) {
        const communicationMetrics = { wpm, filler_count: fillerCount };
        await db.query(
          `INSERT INTO evaluation.response_evaluations
             (response_id, ai_run_id, technical_score, communication_score,
              communication_metrics, dimension_scores, evaluation_version)
           VALUES ($1, $2, $3, $4, $5, $6, '1.0')`,
          [
            responseId,
            aiRunId,
            techScore,
            commScore,
            JSON.stringify(communicationMetrics),
            JSON.stringify({ technical: techScore, communication: commScore }),
          ]
        );
      }

      // 4. session.interview_transcripts — raw audio record (M1 table).
      // Wrapped in catch: table only exists after migration 016 runs; do not block turn
      // submission if it has not been applied yet.
      await db.query(
        `INSERT INTO session.interview_transcripts
           (session_id, student_id, turn_number, transcript_text, response_id, metadata)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (session_id, turn_number) DO NOTHING`,
        [
          sessionId,
          session.student_id,
          turnSeq,
          transcript || null,
          responseId,
          JSON.stringify({ wpm, filler_count: fillerCount, ai_reachable: aiReachable }),
        ]
      ).catch(() => {
        // interview_transcripts may not exist yet — non-fatal
      });

      // 5. Cache turn in Redis (non-fatal if unavailable)
      await sessionContextService.cacheTurn(sessionId, {
        turnNumber: turnSeq,
        transcript,
        timestamp: new Date().toISOString(),
      });

      // 6. Advance session sequence counter
      await db.query(
        `UPDATE session.assessment_sessions
         SET current_sequence_no = $1, last_activity_at = now(), updated_at = now()
         WHERE id = $2`,
        [turnSeq, sessionId]
      );

      sendSuccess(res, {
        responseId,
        transcript,
        technicalScore: techScore,
        communicationScore: commScore,
        wpm,
        fillerCount,
        aiReachable,
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);
