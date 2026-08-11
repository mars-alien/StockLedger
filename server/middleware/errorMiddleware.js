import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function notFound(req, res, next) {
  next(new AppError('NOT_FOUND', 404, `Cannot ${req.method} ${req.originalUrl}`));
}

export function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const { statusCode, code, message, details } = translate(err);

  if (statusCode >= 500) {
    logger.error({ err, requestId: req.id }, 'request failed');
  }

  res.status(statusCode).json({
    error: {
      code,
      message:
        statusCode >= 500 && env.NODE_ENV === 'production' ? 'Something went wrong' : message,
      details,
      requestId: req.id,
    },
  });
}

function translate(err) {
  if (err instanceof AppError) {
    return {
      statusCode: err.statusCode,
      code: err.code,
      message: err.message,
      details: err.details,
    };
  }

  if (err instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: err.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  if (err?.name === 'MulterError') {
    const tooLarge = err.code === 'LIMIT_FILE_SIZE';
    return {
      statusCode: tooLarge ? 413 : 400,
      code: tooLarge ? 'FILE_TOO_LARGE' : 'INVALID_UPLOAD',
      message: tooLarge ? 'Images must be 2 MB or smaller' : 'That upload could not be read',
      details: [],
    };
  }

  // Checked by name rather than instanceof so the error layer does not have to
  // import Prisma, which belongs to the models.
  if (err?.name === 'PrismaClientKnownRequestError') {
    if (err.code === 'P2002') {
      const fields = Array.isArray(err.meta?.target) ? err.meta.target : [];
      return {
        statusCode: 409,
        code: 'DUPLICATE_RESOURCE',
        message: 'A record with those details already exists',
        details: fields.map((field) => ({ field, message: 'must be unique' })),
      };
    }
    if (err.code === 'P2025') {
      return { statusCode: 404, code: 'NOT_FOUND', message: 'Record not found', details: [] };
    }
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_ERROR',
    message: err?.message ?? 'Unexpected error',
    details: [],
  };
}
