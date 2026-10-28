import Fastify from 'fastify';
import { config } from './config.js';

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
  trustProxy: true,
});

app.get('/health', async () => {
  return {
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  };
});

async function start() {
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
    app.log.info(`Server running at http://${config.HOST}:${config.PORT} (Base URL: ${config.BASE_URL})`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}. Starting graceful shutdown...`);
    try {
      await app.close();
      app.log.info('Server closed gracefully');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  });
}

start();
