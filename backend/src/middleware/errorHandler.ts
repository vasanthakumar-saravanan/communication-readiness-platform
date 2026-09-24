import { ErrorRequestHandler } from 'express';
import { AppError } from '../shared/errors/AppError';

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
      code: err.code,
    });
    return;
  }
  console.error(err);
  res.status(500).json({ status: 'error', message: 'Internal server error', code: 'INTERNAL_ERROR' });
};
