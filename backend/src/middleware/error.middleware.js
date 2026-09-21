import { AppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

export const errorHandler = (err, req, res, next) => {
  // Handle Zod validation errors
  if (err.name === 'ZodError') {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));

    logger.warn(`Validation failure on ${req.method} ${req.originalUrl}`, {
      errors: formattedErrors,
    });

    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: formattedErrors,
      },
    });
  }

  // Handle known operational AppErrors
  if (err instanceof AppError) {
    logger.warn(`Handled operational error: ${err.message}`, {
      code: err.code,
      statusCode: err.statusCode,
      path: req.originalUrl,
    });

    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    });
  }

  // Handle unhandled unexpected errors
  logger.error(`Unhandled Exception on ${req.method} ${req.originalUrl}`, err);

  const response = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected internal error occurred. Please try again later.',
    },
  };

  // Only expose error details in development for debugging
  if (env.NODE_ENV === 'development') {
    response.error.debugMessage = err.message;
  }

  return res.status(500).json(response);
};
