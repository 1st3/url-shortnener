import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { runMigrations } from './db/migrate.js';
import { checkDatabaseIntegrity, closeDatabase, getDatabase } from './db/index.js';
import { seedFromRedirects } from './db/seed.js';
import { redirectRoutes } from './routes/redirect.js';
import { apiRoutes } from './routes/api.js';
import { errorHandler } from './middleware/errorHandler.js';
import { analyticsQueue } from './services/analyticsQueue.js';
import { startPruningScheduler } from './services/pruning.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({
  logger: {
    level: config.LOG_LEVEL,
  },
  trustProxy: true,
});

app.setErrorHandler(errorHandler);

app.get('/health', async () => {
  const dbOk = checkDatabaseIntegrity();
  const queueStats = analyticsQueue.getStats();
  return {
    status: dbOk ? 'healthy' : 'degraded',
    database: dbOk ? 'ok' : 'corrupted',
    analyticsQueue: queueStats,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  };
});

async function start() {
  try {
    // Run migrations before listening
    app.log.info('Running database migrations...');
    runMigrations();

    const dbOk = checkDatabaseIntegrity();
    if (!dbOk) {
      throw new Error('Database integrity check failed!');
    }
    app.log.info('Database integrity verified: OK');

    // Auto-seed legacy redirects if links table is empty
    const db = getDatabase();
    const countRow = db.prepare('SELECT COUNT(*) as count FROM links').get() as { count: number };
    if (countRow.count === 0) {
      app.log.info('Links table empty, auto-seeding from legacy _redirects...');
      const seedResult = seedFromRedirects();
      app.log.info(`Auto-seed complete: ${seedResult.seeded} entries imported.`);
    }

    // Start background analytics pruning scheduler
    startPruningScheduler();

    // Register Static UI assets for /admin
    let publicDir = path.join(__dirname, 'public');
    if (!fs.existsSync(publicDir)) {
      publicDir = path.resolve(process.cwd(), 'src/public');
    }

    await app.register(fastifyStatic, {
      root: publicDir,
      prefix: '/admin/',
    });

    app.get('/admin', async (req, reply) => {
      return reply.redirect('/admin/', 302);
    });

    // Register API routes
    await app.register(apiRoutes);

    // Register redirection routes
    await app.register(redirectRoutes);

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
      await analyticsQueue.shutdown();
      closeDatabase();
      app.log.info('Server, analytics queue, and database closed gracefully');
      process.exit(0);
    } catch (err) {
      app.log.error(err, 'Error during shutdown');
      process.exit(1);
    }
  });
}

start();
