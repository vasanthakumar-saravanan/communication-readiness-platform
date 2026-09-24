import { Router } from 'express';
import { healthRouter } from './health';
import { authRouter } from './auth.routes';
import { studentRouter } from './student.routes';
import { interviewRouter } from './interview.routes';
import { portalRouter } from './portal.routes';
import { orgRouter } from './org.routes';
import { mentorRouter } from './mentor.routes';
import { trainerRouter } from './trainer.routes';
import { adminRouter } from './admin.routes';
import { authenticate } from '../middleware/authenticate';

export const router = Router();

// Public
router.use('/health', healthRouter);
router.use('/auth', authRouter);

// Protected — authenticate on every request; individual routes add authorize() as needed
router.use('/students', authenticate, studentRouter);
router.use('/sessions', authenticate, interviewRouter);
router.use('/portals', authenticate, portalRouter);
router.use('/org', authenticate, orgRouter);
router.use('/mentors', authenticate, mentorRouter);
router.use('/trainers', authenticate, trainerRouter);
router.use('/admin', authenticate, adminRouter);
