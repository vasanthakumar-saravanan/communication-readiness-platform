import { Router } from 'express';
import { env } from '../config/env';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'backend',
    env: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});
