import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth.routes';
import { studentRouter } from './student.routes';
import { interviewRouter } from './interview.routes';
import { portalRouter } from './portal.routes';
import { orgRouter } from './org.routes';
import { ownerRouter } from './owner.routes';
import { mentorRouter } from './mentor.routes';
import { trainerRouter } from './trainer.routes';
import { adminRouter } from './admin.routes';
import { skillsRouter } from './skills.routes';
import { performanceRouter } from './performance.routes';
import { listeningRouter } from './listening.routes';
import { learningRouter } from './learning.routes';
import { authenticate } from '../middleware/authenticate';
import { facultyRouter } from './faculty.routes';
import { reportsRouter } from '../modules/reports/reports.routes';
import { suggestionsRouter } from './suggestions.routes';

export const router = Router();

// Public
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// Org lookup endpoints are read-only and needed before login (e.g. batch list on registration form).
router.use('/org', orgRouter);

// Platform Owner routes — protected, requires PLATFORM_OWNER role
router.use('/owner', authenticate, ownerRouter);

// Protected — authenticate on every request; individual routes add authorize() as needed
router.use('/students', authenticate, studentRouter);
router.use('/sessions', authenticate, interviewRouter);
router.use('/reports', authenticate, reportsRouter);
router.use('/portals', authenticate, portalRouter);
router.use('/mentors', authenticate, mentorRouter);
router.use('/trainers', authenticate, trainerRouter);
router.use('/admin', authenticate, adminRouter);
router.use('/faculty', authenticate, facultyRouter);

// Module 3 — Skills, Performance, Listening, Learning & Agent
router.use('/skills', authenticate, skillsRouter);
router.use('/performance', authenticate, performanceRouter);
router.use('/listening', authenticate, listeningRouter);
router.use('/learning', authenticate, learningRouter);
router.use('/suggestions', authenticate, suggestionsRouter);
