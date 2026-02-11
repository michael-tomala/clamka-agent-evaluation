/**
 * API Server - Fastify server dla testing framework
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { createRedisConnection, closeRedisConnection } from './config/redis';
import { getTestRunnerService } from './services/test-runner';
import scenariosRoutes from './routes/scenarios';
import resultsRoutes from './routes/results';
import streamRoutes from './routes/stream';
import toolsRoutes from './routes/tools';
import fixturesRoutes from './routes/fixtures';
import claudeVisionRoutes from './routes/claude-vision';
import renderRoutes from './routes/render';
import compositionTestsRoutes from './routes/composition-tests';

const PORT = parseInt(process.env.EVAL_API_PORT || '3100');
const HOST = process.env.EVAL_API_HOST || '0.0.0.0';

async function start(): Promise<void> {
  // Inicjalizuj Redis
  console.log('[API] Connecting to Redis...');
  createRedisConnection();

  // Utwórz serwer Fastify
  const fastify = Fastify({
    logger: {
      level: 'info',
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  // CORS
  await fastify.register(cors, {
    origin: true, // Pozwól na wszystkie originy w dev
    credentials: true,
  });

  // WebSocket
  await fastify.register(websocket);

  // Routes
  await fastify.register(scenariosRoutes, { prefix: '/api' });
  await fastify.register(resultsRoutes, { prefix: '/api' });
  await fastify.register(streamRoutes, { prefix: '/api' });
  await fastify.register(toolsRoutes, { prefix: '/api' });
  await fastify.register(fixturesRoutes, { prefix: '/api' });
  await fastify.register(claudeVisionRoutes, { prefix: '/api' });
  await fastify.register(renderRoutes, { prefix: '/api' });
  await fastify.register(compositionTestsRoutes, { prefix: '/api' });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // Root
  fastify.get('/', async () => ({
    name: 'Agent Evaluation API',
    version: '1.0.0',
    endpoints: {
      scenarios: '/api/scenarios',
      tools: '/api/tools',
      suites: '/api/suites',
      jobs: '/api/jobs/:jobId',
      stream: '/api/stream/:jobId (WebSocket)',
      fixtures: '/api/fixtures/projects',
      render: '/api/render/chapter',
      renders: '/api/renders/:jobId.mp4',
      health: '/health',
    },
  }));

  // Startuj test runner worker
  console.log('[API] Starting test runner worker...');
  const testRunner = getTestRunnerService();
  testRunner.startWorker();

  // Obsłuż sygnały zamknięcia
  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[API] Received ${signal}, shutting down...`);

    await testRunner.stopWorker();
    await closeRedisConnection();
    await fastify.close();

    console.log('[API] Shutdown complete');
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Start
  try {
    await fastify.listen({ port: PORT, host: HOST });
    console.log(`\n[API] Server running at http://${HOST}:${PORT}`);
    console.log(`[API] WebSocket available at ws://${HOST}:${PORT}/api/stream`);
    console.log('\n[API] Ready to accept test requests\n');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

start().catch((err) => {
  console.error('[API] Fatal error:', err);
  process.exit(1);
});
