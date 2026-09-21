export const getHealth = (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    environment: process.env.NODE_ENV || 'development',
  });
};

export const getReadiness = (req, res) => {
  // Can be extended in subsequent phases to verify database and AI provider connectivity
  res.status(200).json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      server: 'healthy',
      configuration: 'loaded',
    },
  });
};
