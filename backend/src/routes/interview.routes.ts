import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../shared/db/pool';
import { AppError } from '../shared/errors/AppError';
import { sendSuccess, sendError } from '../shared/helpers/response';
import { AuthRequest } from '../middleware/authenticate';
import { eventBus } from '../shared/events/eventBus';
import { Events, AttemptCompletedPayload } from '../shared/events/events';
import { env } from '../config/env';
import { sessionContextService } from '../services/sessionContextService';

export const interviewRouter = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const startSessionSchema = z.object({
  studentId: z.string().uuid(),
  goal:      z.string().min(1).max(500).default('Improve technical skills and interview readiness'),
});

const concludeSessionSchema = z.object({
  goal:               z.string().min(1).max(500).optional(),
  overallScore:       z.number().min(0).max(100),
  technicalScore:     z.number().min(0).max(100).optional().nullable(),
  communicationScore: z.number().min(0).max(100).optional().nullable(),
  listeningScore:     z.number().min(0).max(100).optional().nullable(),
});

const submitAnswerSchema = z.object({
  question_text: z.string(),
  student_answer: z.string(),
  duration_seconds: z.number().optional().default(20)
});

// ── Helper: look up student org context ──────────────────────────────────────

async function getStudentContext(studentId: string) {
  const { rows } = await db.query(
    `SELECT s.id, s.batch_id, s.subdivision_id, b.program_id
     FROM org.students s
     JOIN org.batches b ON b.id = s.batch_id
     WHERE s.id = $1`,
    [studentId]
  );
  if (rows.length === 0) throw new AppError(404, 'Student not found', 'NOT_FOUND');
  return rows[0] as {
    id: string;
    program_id: string;
    batch_id: string;
    subdivision_id: string | null;
  };
}

// ── POST /api/sessions — Start an interview session ──────────────────────────
// Creates a new assessment_attempt linked to the student and returns the session ID.

interviewRouter.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const parsed = startSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
    const { studentId, goal } = parsed.data;

    // SECURITY: Verify student ownership for STUDENT role
    if (req.user!.role === 'STUDENT') {
      const { rows: ownershipCheck } = await db.query(
        'SELECT id FROM org.students WHERE id = $1 AND user_id = $2',
        [studentId, req.user!.id]
      );
      if (ownershipCheck.length === 0) {
        throw new AppError(403, 'Can only create session for yourself', 'FORBIDDEN');
      }
    }

    const student = await getStudentContext(studentId);

    // Use the first active assessment as the template
    const { rows: assessmentRows } = await db.query(
      `SELECT id FROM assessment.assessments WHERE is_active = true ORDER BY created_at LIMIT 1`
    );
    if (assessmentRows.length === 0) {
      throw new AppError(503, 'No active assessment configuration found', 'NO_ASSESSMENT');
    }
    const assessmentId: string = assessmentRows[0].id;

    // Resume existing IN_PROGRESS attempt if one exists (enforced by unique partial index)
    const { rows: existingAttempt } = await db.query(
      `SELECT aa.id as attempt_id, ss.id as session_id
       FROM assessment.assessment_attempts aa
       JOIN session.assessment_sessions ss ON ss.attempt_id = aa.id
       WHERE aa.student_id = $1 AND aa.assessment_id = $2 AND aa.status = 'IN_PROGRESS'
       ORDER BY aa.started_at DESC LIMIT 1`,
      [studentId, assessmentId]
    );
    if (existingAttempt.length > 0) {
      const { attempt_id: attemptId, session_id: sessionId } = existingAttempt[0];
      console.log(`[interview] Resuming existing session sessionId=${sessionId} attemptId=${attemptId} studentId=${studentId}`);
      sendSuccess(res, { sessionId, attemptId, goal, resumed: true }, 200);
      return;
    }

    // Create attempt + session atomically to prevent orphaned IN_PROGRESS attempts
    const client = await db.connect();
    let attemptId: string;
    let sessionId: string;
    try {
      await client.query('BEGIN');

      const { rows: attemptRows } = await client.query(
        `INSERT INTO assessment.assessment_attempts
           (assessment_id, student_id, interview_type, program_id, batch_id,
            subdivision_id, assessment_version, scoring_version, status, started_at)
         VALUES ($1,$2,'TECHNICAL',$3,$4,$5,1,'v1.0','IN_PROGRESS',now())
         RETURNING id`,
        [assessmentId, studentId, student.program_id, student.batch_id, student.subdivision_id]
      );
      attemptId = attemptRows[0].id;

      const { rows: sessionRows } = await client.query(
        `INSERT INTO session.assessment_sessions
           (attempt_id, current_sequence_no, state, last_activity_at)
         VALUES ($1, 0, 'ACTIVE', now())
         RETURNING id`,
        [attemptId]
      );
      sessionId = sessionRows[0].id;

      await client.query('COMMIT');
    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

    console.log(
      `[interview] Session started sessionId=${sessionId} attemptId=${attemptId} ` +
      `studentId=${studentId} goal="${goal}"`
    );

    sendSuccess(res, { sessionId, attemptId, goal }, 201);
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/sessions/reports — Performance history for logged-in student ─────
// Must come BEFORE /:sessionId routes so Express doesn't treat "reports" as a UUID param.

interviewRouter.get('/reports', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.user!.role !== 'STUDENT') {
      throw new AppError(403, 'Students only', 'FORBIDDEN');
    }

    const { rows: studentRows } = await db.query(
      'SELECT id FROM org.students WHERE user_id = $1',
      [req.user!.id],
    );
    if (studentRows.length === 0) {
      sendSuccess(res, { reports: [] });
      return;
    }
    const studentId = studentRows[0].id;

    const { rows } = await db.query(
      `SELECT ar.attempt_id, ar.overall_score, ar.technical_score, ar.communication_score,
              ar.created_at
       FROM performance.assessment_reports ar
       JOIN assessment.assessment_attempts aa ON aa.id = ar.attempt_id
       WHERE ar.student_id = $1 AND aa.status = 'COMPLETED'
       ORDER BY ar.created_at ASC`,
      [studentId],
    );

    const reports = rows.map((r: any, i: number) => ({
      attempt: i + 1,
      attemptId: r.attempt_id,
      overallScore: r.overall_score ?? 0,
      technicalScore: r.technical_score ?? 0,
      communicationScore: r.communication_score ?? 0,
      date: r.created_at
        ? new Date(r.created_at).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric',
          })
        : '',
    }));

    sendSuccess(res, { reports });
  } catch (err) {
    sendError(res, err);
  }
});

// ── GET /api/sessions/:sessionId/next-question ────────────────────────────────
// Generates the next interview question by calling the AI service

interviewRouter.get('/:sessionId/next-question', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;

    // SECURITY: STUDENT role may only access their own session
    if (req.user!.role === 'STUDENT') {
      const { rows: ownerCheck } = await db.query(
        `SELECT aa.student_id
         FROM session.assessment_sessions ss
         JOIN assessment.assessment_attempts aa ON aa.id = ss.attempt_id
         JOIN org.students s ON s.id = aa.student_id
         WHERE ss.id = $1 AND s.user_id = $2`,
        [sessionId, req.user!.id]
      );
      if (ownerCheck.length === 0) {
        throw new AppError(403, 'Access denied to this session', 'FORBIDDEN');
      }
    }

    // Fetch session
    const { rows: sessionRows } = await db.query(
      `SELECT ss.attempt_id, ss.current_sequence_no, ss.state
       FROM session.assessment_sessions ss WHERE ss.id = $1`,
      [sessionId]
    );
    if (sessionRows.length === 0) {
      throw new AppError(404, 'Session not found', 'NOT_FOUND');
    }
    const session = sessionRows[0];

    // Fetch student profile
    const { rows: attemptRows } = await db.query(
      `SELECT student_id FROM assessment.assessment_attempts WHERE id = $1`,
      [session.attempt_id]
    );
    const studentId = attemptRows[0].student_id;

    const { rows: studentRows } = await db.query(
      `SELECT u.name, s.parsed_resume, b.program_id
       FROM org.students s
       JOIN identity.users u ON u.id = s.user_id
       JOIN org.batches b ON b.id = s.batch_id
       WHERE s.id = $1`,
      [studentId]
    );
    const student = studentRows[0];

    // Determine difficulty based on turn number
    const turnNumber = session.current_sequence_no + 1;
    const difficulty = turnNumber === 1 ? 'EASY' : turnNumber === 2 ? 'MEDIUM' : 'ADVANCED';

    // Extract skills and resume context
    let skills: string[] = [];
    let projects: any[] = [];
    let resumeText = '';
    if (student.parsed_resume) {
      skills = student.parsed_resume.skills?.languages || [];
      projects = student.parsed_resume.projects || [];
      resumeText = student.parsed_resume.text || '';

      // Build comprehensive resume summary for personalization
      const resumeSummary = [];
      if (student.parsed_resume.skills) {
        const allSkills = [
          ...(student.parsed_resume.skills.languages || []),
          ...(student.parsed_resume.skills.frameworks || [])
        ].join(', ');
        resumeSummary.push(`Skills: ${allSkills}`);
      }
      if (projects.length > 0) {
        resumeSummary.push(`Projects: ${projects.map((p: any) => p.title || '').join(', ')}`);
      }
      resumeText = resumeSummary.join('\n') + '\n' + resumeText;
    }

    console.log(`[interview] Generating question for ${student.name} with resume context (${resumeText.length} chars)`);

    // Call AI service to generate PERSONALIZED question based on resume
    const aiServiceUrl = env.AI_SERVICE_URL || 'http://localhost:8001';
    const aiResponse = await fetch(`${aiServiceUrl}/ai/generate-question`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_name: student.name,
        skills: skills.slice(0, 5), // Increased from 3 to 5
        projects: projects.slice(0, 3), // Increased from 2 to 3
        resume_context: resumeText, // NEW: Full resume context
        previous_turns: (await sessionContextService.getTurns(sessionId, 5)).map((t) => ({
          question_text: t.question,
          student_answer: t.answer,
          difficulty: t.difficulty,
          technical_score: t.technical_score ?? null,
          feedback: t.summary ?? null,
        })),
        difficulty,
        domain: 'Technical'
      })
    });

    if (!aiResponse.ok) {
      throw new AppError(502, 'AI service error', 'AI_SERVICE_ERROR');
    }

    const question = await aiResponse.json() as {
      question_text: string;
      difficulty: string;
      category: string;
    };

    sendSuccess(res, {
      question_text: question.question_text,
      difficulty: question.difficulty,
      category: question.category,
      turn_number: turnNumber,
      key_points: Array.isArray((question as any).key_points) ? (question as any).key_points : []
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /api/sessions/:sessionId/submit-answer ────────────────────────────────
// Submits an answer, evaluates it via AI service, determines next step

interviewRouter.post('/:sessionId/submit-answer', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const parsed = submitAnswerSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
    const { question_text, student_answer, duration_seconds } = parsed.data;

    // SECURITY: STUDENT role may only submit answers for their own session
    if (req.user!.role === 'STUDENT') {
      const { rows: ownerCheck } = await db.query(
        `SELECT aa.student_id
         FROM session.assessment_sessions ss
         JOIN assessment.assessment_attempts aa ON aa.id = ss.attempt_id
         JOIN org.students s ON s.id = aa.student_id
         WHERE ss.id = $1 AND s.user_id = $2`,
        [sessionId, req.user!.id]
      );
      if (ownerCheck.length === 0) {
        throw new AppError(403, 'Access denied to this session', 'FORBIDDEN');
      }
    }

    // Fetch session
    const { rows: sessionRows } = await db.query(
      `SELECT ss.attempt_id, ss.current_sequence_no FROM session.assessment_sessions ss
       WHERE ss.id = $1`,
      [sessionId]
    );
    if (sessionRows.length === 0) {
      throw new AppError(404, 'Session not found', 'NOT_FOUND');
    }

    const session = sessionRows[0];
    const turnNumber = session.current_sequence_no + 1;
    const difficulty = turnNumber === 1 ? 'EASY' : turnNumber === 2 ? 'MEDIUM' : 'ADVANCED';

    // Call AI service to evaluate
    const aiServiceUrl = env.AI_SERVICE_URL || 'http://localhost:8001';
    const aiResponse = await fetch(`${aiServiceUrl}/ai/evaluate-turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question_text,
        student_answer,
        difficulty,
        turn_number: turnNumber,
        domain: 'Technical'
      })
    });

    if (!aiResponse.ok) {
      throw new AppError(502, 'AI service error', 'AI_SERVICE_ERROR');
    }

    const evaluation = await aiResponse.json() as {
      technical_score: number;
      communication_score: number;
      wpm: number;
      filler_words: number;
      feedback: string;
      strengths: string;
      weaknesses: string;
    };

    // Scale scores from 0-10 (AI service) to 0-100 (frontend expects)
    const technicalScore = Math.round(evaluation.technical_score * 10);
    const communicationScore = Math.round(evaluation.communication_score * 10);

    // Persist the evaluated turn into the same server-side context used by live follow-ups.
    await sessionContextService.appendTurn(sessionId, {
      turn: turnNumber,
      question: question_text,
      answer: student_answer,
      summary: [evaluation.feedback, evaluation.weaknesses].filter(Boolean).join(' '),
      difficulty,
      technical_score: technicalScore,
      ts: new Date().toISOString(),
    });

    // Update session sequence
    await db.query(
      `UPDATE session.assessment_sessions
       SET current_sequence_no = $1, last_activity_at = now()
       WHERE id = $2`,
      [session.current_sequence_no + 1, sessionId]
    );

    // Use configured server-side session length, never a hardcoded three-turn cap.
    const isCompleted = turnNumber >= env.MAX_QUESTIONS_PER_SESSION;

    sendSuccess(res, {
      isCompleted,
      turnEvaluation: {
        turn_number: turnNumber,
        technical_score: technicalScore,
        communication_score: communicationScore,
        wpm: evaluation.wpm,
        filler_words: evaluation.filler_words,
        feedback: evaluation.feedback,
        strengths: evaluation.strengths,
        weaknesses: evaluation.weaknesses
      },
      nextQuestionAvailable: !isCompleted
    });
  } catch (err) {
    sendError(res, err);
  }
});

// ── POST /api/sessions/:id/conclude — Conclude session, trigger Module 3 ─────
// Marks the attempt COMPLETED, stores scores, emits ATTEMPT_COMPLETED event.
// The event handler in module3Handlers.ts updates performance data AND triggers
// the Module 3 agent, which calls Groq to generate a personalized roadmap.

interviewRouter.post('/:id/conclude', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const sessionId = req.params.id;
    const parsed = concludeSessionSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(422, 'Validation failed', 'VALIDATION_ERROR');
    const {
      goal,
      overallScore,
      technicalScore,
      communicationScore,
      listeningScore,
    } = parsed.data;

    // SECURITY: STUDENT role may only conclude their own session
    if (req.user!.role === 'STUDENT') {
      const { rows: ownerCheck } = await db.query(
        `SELECT aa.student_id
         FROM session.assessment_sessions ss
         JOIN assessment.assessment_attempts aa ON aa.id = ss.attempt_id
         JOIN org.students s ON s.id = aa.student_id
         WHERE ss.id = $1 AND s.user_id = $2`,
        [sessionId, req.user!.id]
      );
      if (ownerCheck.length === 0) {
        throw new AppError(403, 'Access denied to this session', 'FORBIDDEN');
      }
    }

    // Load attempt via session
    const { rows: sessionRows } = await db.query(
      `SELECT ss.attempt_id
       FROM session.assessment_sessions ss
       WHERE ss.id = $1`,
      [sessionId]
    );
    if (sessionRows.length === 0) {
      throw new AppError(404, 'Session not found', 'NOT_FOUND');
    }
    const attemptId: string = sessionRows[0].attempt_id;

    // Load attempt
    const { rows: attemptRows } = await db.query(
      `SELECT student_id, program_id, batch_id, subdivision_id, status
       FROM assessment.assessment_attempts WHERE id = $1`,
      [attemptId]
    );
    if (attemptRows.length === 0) throw new AppError(404, 'Attempt not found', 'NOT_FOUND');
    const attempt = attemptRows[0];

    if (attempt.status === 'COMPLETED') {
      sendSuccess(res, { message: 'Already concluded', attemptId });
      return;
    }

    // Mark attempt complete
    await db.query(
      `UPDATE assessment.assessment_attempts
       SET status='COMPLETED', completed_at=now() WHERE id=$1`,
      [attemptId]
    );

    // For a live interview, aggregate scores from server-owned turn results.
    // Client-supplied aggregate scores are only a legacy fallback when no live state exists.
    const liveState = await sessionContextService.getState(sessionId);
    const liveTurns = liveState?.turn_results ?? [];
    const derivedTechnical = liveTurns.length
      ? Math.round(liveTurns.reduce((sum, t) => sum + t.technicalScore, 0) / liveTurns.length)
      : technicalScore ?? null;
    const derivedCommunication = liveTurns.length
      ? Math.round(liveTurns.reduce((sum, t) => sum + t.communicationScore, 0) / liveTurns.length)
      : communicationScore ?? null;
    const derivedOverall = liveTurns.length
      ? Math.round(liveTurns.reduce((sum, t) => sum + t.overallScore, 0) / liveTurns.length)
      : overallScore;

    // Store assessment report with server-derived scores when available
    await db.query(
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
        derivedTechnical,
        derivedCommunication,
        listeningScore ?? null,
        derivedOverall,
        JSON.stringify({
          TECHNICAL: derivedTechnical,
          COMMUNICATION: derivedCommunication,
          LISTENING: listeningScore,
        }),
      ]
    );

    // Update session state
    await db.query(
      `UPDATE session.assessment_sessions SET state='COMPLETED', last_activity_at=now() WHERE id=$1`,
      [sessionId]
    );

    const resolvedGoal =
      goal ?? 'Improve technical skills, communication skills, and interview readiness';

    console.log(
      `[interview] Session concluded sessionId=${sessionId} attemptId=${attemptId} ` +
      `studentId=${attempt.student_id} overallScore=${overallScore} goal="${resolvedGoal}"`
    );

    // Emit ATTEMPT_COMPLETED — module3Handlers updates performance data
    // and triggers the Module 3 agent (Groq roadmap generation)
    const payload: AttemptCompletedPayload = {
      attemptId,
      studentId:         attempt.student_id,
      programId:         attempt.program_id,
      batchId:           attempt.batch_id,
      subdivisionId:     attempt.subdivision_id,
      overallScore:       derivedOverall,
      technicalScore:    derivedTechnical,
      communicationScore: derivedCommunication,
      listeningScore:    listeningScore ?? null,
      goal:              resolvedGoal,
    };
    eventBus.emit(Events.ATTEMPT_COMPLETED, payload);

    sendSuccess(res, { message: 'Session concluded. Module 3 agent triggered.', attemptId });
  } catch (err) {
    sendError(res, err);
  }
});
