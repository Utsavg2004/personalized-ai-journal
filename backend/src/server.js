import app from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`Personalized AI Journal Server running on port ${PORT}`, {
    environment: env.NODE_ENV,
    port: PORT,
    llmProvider: env.LLM_PROVIDER,
    embeddingProvider: env.EMBEDDING_PROVIDER,
  });
});

// Graceful shutdown handlers
const handleShutdown = (signal) => {
  logger.info(`Received ${signal}. Initiating graceful shutdown...`);
  server.close(() => {
    logger.info('HTTP server closed successfully. Exiting process.');
    process.exit(0);
  });

  // Force close if graceful shutdown takes longer than 10s
  setTimeout(() => {
    logger.error('Forcefully terminating process due to shutdown timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

export default server;
