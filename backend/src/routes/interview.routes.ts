import { Router } from 'express';

export const interviewRouter = Router();

// POST /api/interview/sessions              — start session (eligibility + credit check)
// POST /api/interview/sessions/:id/turns   — submit turn (sync AI eval → scoring → next question)
// GET  /api/interview/sessions/:id         — get session state
// POST /api/interview/sessions/:id/conclude
// POST /api/interview/sessions/:id/proctor-event
