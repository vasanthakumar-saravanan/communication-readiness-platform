-- M2: performance indexes for all M2 tables

-- assessment_attempts
CREATE INDEX idx_attempts_student_id         ON assessment.assessment_attempts(student_id);
CREATE INDEX idx_attempts_assessment_id      ON assessment.assessment_attempts(assessment_id);
CREATE INDEX idx_attempts_student_status     ON assessment.assessment_attempts(student_id, status);
CREATE INDEX idx_attempts_program_batch      ON assessment.assessment_attempts(program_id, batch_id);

-- assessment_sessions
CREATE INDEX idx_sessions_attempt_id         ON session.assessment_sessions(attempt_id);
CREATE INDEX idx_sessions_state              ON session.assessment_sessions(state);

-- questions
CREATE INDEX idx_questions_attempt_id        ON session.questions(attempt_id);

-- responses
CREATE INDEX idx_responses_attempt_id        ON evaluation.responses(attempt_id);
CREATE INDEX idx_responses_question_id       ON evaluation.responses(question_id);

-- ai_runs
CREATE INDEX idx_ai_runs_response_id         ON evaluation.ai_runs(response_id);
CREATE INDEX idx_ai_runs_status              ON evaluation.ai_runs(status);

-- response_evaluations
CREATE INDEX idx_evaluations_response_id     ON evaluation.response_evaluations(response_id);

-- assessment_reports
CREATE INDEX idx_reports_student_id          ON performance.assessment_reports(student_id);
CREATE INDEX idx_reports_attempt_id          ON performance.assessment_reports(attempt_id);

-- question_bank_items
CREATE INDEX idx_qbi_difficulty_active       ON session.question_bank_items(difficulty, is_active);
