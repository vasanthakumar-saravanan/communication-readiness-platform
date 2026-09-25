import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth.routes';
import { studentRouter } from './student.routes';
import { portalRouter } from './portal.routes';
import { orgRouter } from './org.routes';
import { mentorRouter } from './mentor.routes';
import { trainerRouter } from './trainer.routes';
import { adminRouter } from './admin.routes';
import { authenticate } from '../middleware/authenticate';

// Module 2 routers
import { assessmentsRouter } from '../modules/assessments/assessments.routes';
import { attemptsRouter } from '../modules/attempts/attempts.routes';
import { sessionsRouter } from '../modules/sessions/sessions.routes';
import { responsesRouter } from '../modules/responses/responses.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { questionBankRouter } from '../modules/question-bank/question-bank.routes';

export const router = Router();

// Public
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// Org lookup endpoints are read-only and needed before login (e.g. batch list on registration form).
router.use('/org', orgRouter);

// Protected — authenticate on every request; individual routes add authorize() as needed
router.use('/students', authenticate, studentRouter);
router.use('/portals', authenticate, portalRouter);
router.use('/mentors', authenticate, mentorRouter);
router.use('/trainers', authenticate, trainerRouter);
router.use('/admin', authenticate, adminRouter);

// Module 2 — Assessment lifecycle (auth is applied per-route inside each module)
router.use('/assessments', assessmentsRouter);
router.use('/attempts', attemptsRouter);
router.use('/sessions', sessionsRouter);
router.use('/responses', responsesRouter);
router.use('/reports', reportsRouter);
router.use('/question-bank', questionBankRouter);
