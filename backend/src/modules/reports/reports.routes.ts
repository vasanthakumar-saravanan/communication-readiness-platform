import { Router, Response } from 'express';
import { db } from '../../shared/db/pool';
import { AppError } from '../../shared/errors/AppError';
import { sendSuccess, sendError } from '../../shared/helpers/response';
import { authenticate, AuthRequest } from '../../middleware/authenticate';

export const reportsRouter = Router();

// GET /api/reports/:attemptId
reportsRouter.get(
  '/:attemptId',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { attemptId } = req.params;
      const user = req.user!;

      const { rows } = await db.query(
        `SELECT r.id, r.attempt_id, r.student_id, r.overall_score,
                r.technical_score, r.communication_score, r.component_scores,
                r.strengths, r.weaknesses, r.feedback, r.scoring_version,
                r.created_at,
                a.assessment_id, a.interview_type,
                s.user_id AS student_user_id,
                asmt.assessment_type
         FROM performance.assessment_reports r
         JOIN assessment.assessment_attempts a ON a.id = r.attempt_id
         JOIN org.students s ON s.id = r.student_id
         JOIN assessment.assessments asmt ON asmt.id = a.assessment_id
         WHERE r.attempt_id = $1`,
        [attemptId]
      );
      if (rows.length === 0) throw new AppError(404, 'Report not found', 'NOT_FOUND');

      const report = rows[0];

      // Access control
      if (user.role === 'STUDENT' && report.student_user_id !== user.id) {
        throw new AppError(403, 'Access denied', 'FORBIDDEN');
      }
      if (user.role === 'FACULTY_MENTOR') {
        const { rows: assigned } = await db.query(
          `SELECT id FROM org.student_mentor_assignments
           WHERE student_id = $1 AND mentor_id = $2 AND is_active = true`,
          [report.student_id, user.id]
        );
        if (assigned.length === 0) throw new AppError(403, 'Not assigned to this student', 'FORBIDDEN');
      }

      // Per-question breakdown
      const { rows: breakdown } = await db.query(
        `SELECT q.question_text, q.difficulty, q.sequence_no,
                re.technical_score, re.communication_score,
                re.feedback, re.strengths, re.weaknesses
         FROM session.questions q
         JOIN evaluation.responses resp ON resp.question_id = q.id AND resp.attempt_id = $1
         LEFT JOIN evaluation.response_evaluations re ON re.response_id = resp.id
         ORDER BY q.sequence_no`,
        [attemptId]
      );

      const componentScores = report.component_scores ?? {};

      sendSuccess(res, {
        report: {
          id: report.id,
          attemptId: report.attempt_id,
          studentId: report.student_id,
          sessionType: report.assessment_type ?? report.interview_type,
          overallScore: report.overall_score,
          technicalScore: report.technical_score,
          communicationScore: report.communication_score,
          isProctorFlagged: componentScores.is_proctor_flagged ?? false,
          tabSwitchCount: componentScores.tab_switch_count ?? 0,
          totalQuestions: componentScores.total_questions ?? breakdown.length,
          generatedAt: report.created_at,
          questionBreakdown: breakdown.map(b => ({
            questionText: b.question_text,
            difficulty: b.difficulty,
            sequenceNo: b.sequence_no,
            technicalScore: b.technical_score,
            communicationScore: b.communication_score,
            feedback: b.feedback,
            strengths: b.strengths,
            weaknesses: b.weaknesses,
          })),
        },
      });
    } catch (err) {
      sendError(res, err);
    }
  }
);
