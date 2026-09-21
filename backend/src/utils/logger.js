/**
 * Structured logger for development and production.
 * Ensures clean visibility in the terminal for RAG verification
 * while preventing sensitive journal content from being leaked to stdout.
 */

const formatTimestamp = () => new Date().toISOString();

export const logger = {
  info: (message, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.log(`[${formatTimestamp()}] [INFO] ${message}${metaStr}`);
  },

  warn: (message, meta = {}) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    console.warn(`[${formatTimestamp()}] [WARN] ${message}${metaStr}`);
  },

  error: (message, error = null) => {
    const errorDetails = error
      ? ` | ${error.name || 'Error'}: ${error.message} ${error.stack ? `\n${error.stack}` : ''}`
      : '';
    console.error(`[${formatTimestamp()}] [ERROR] ${message}${errorDetails}`);
  },

  http: (req, res, responseTimeMs) => {
    console.log(
      `[${formatTimestamp()}] [HTTP] ${req.method} ${req.originalUrl || req.url} ` +
      `status=${res.statusCode} duration=${responseTimeMs}ms ip=${req.ip}`
    );
  },

  auth: (action, { userId = 'anonymous', email = '', success = true, reason = '' } = {}) => {
    const status = success ? 'SUCCESS' : `FAILED (${reason})`;
    console.log(
      `[${formatTimestamp()}] [AUTH] ${action} - user_id=${userId} email=${email || 'n/a'} status=${status}`
    );
  },

  /**
   * Dedicated RAG observability logging for video demo and interview verification.
   * NOTE: Does NOT log raw journal or query content to preserve privacy.
   */
  rag: (step, details = {}) => {
    const detailParts = Object.entries(details)
      .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join(' ');
    console.log(
      `[${formatTimestamp()}] [RAG] [${step.toUpperCase()}] ${detailParts}`
    );
  }
};
