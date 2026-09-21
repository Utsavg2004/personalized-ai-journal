/**
 * Base Application Error class for controlled operational errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details = null) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Invalid request payload', details = null) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details = null) {
    super(message, 400, 'VALIDATION_ERROR', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied: insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource already exists') {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
  }
}

export class UpstreamServiceError extends AppError {
  constructor(service = 'External Provider', message = 'Upstream service failure') {
    super(`${service} error: ${message}`, 502, 'UPSTREAM_SERVICE_ERROR');
  }
}

export class EmbeddingError extends AppError {
  constructor(message = 'Failed to generate embeddings for this content') {
    super(message, 502, 'EMBEDDING_ERROR');
  }
}

export class LLMError extends AppError {
  constructor(message = 'Failed to generate a response from the language model') {
    super(message, 502, 'LLM_ERROR');
  }
}
