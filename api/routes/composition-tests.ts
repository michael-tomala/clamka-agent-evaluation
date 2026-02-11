/**
 * Composition Tests Routes - API endpoints dla testowania kompozycji
 *
 * Endpoints:
 * - GET  /api/composition-tests/fixtures             - Lista wszystkich fixtures
 * - GET  /api/composition-tests/fixtures/:definitionId - Fixtures jednej kompozycji
 * - POST /api/composition-tests/render               - Renderuj fixture { fixtureId }
 * - POST /api/composition-tests/render-batch          - Renderuj wiele { definitionId? }
 * - GET  /api/composition-tests/jobs/:jobId           - Status jednego joba
 * - GET  /api/composition-tests/batch/:batchId        - Status batcha
 * - GET  /api/composition-tests/renders               - Lista wyrenderowanych plików
 * - GET  /api/composition-tests/renders/:fixtureId/video - Serwuj plik MP4
 * - DELETE /api/composition-tests/renders/:fixtureId  - Usuń renderowany plik
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import path from 'path';
import fs from 'fs';
import { compositionTestService } from '../services/composition-test-service';

// ============================================================================
// TYPES
// ============================================================================

interface DefinitionIdParams {
  definitionId: string;
}

interface JobIdParams {
  jobId: string;
}

interface BatchIdParams {
  batchId: string;
}

interface FixtureIdParams {
  fixtureId: string;
}

interface RenderBody {
  fixtureId: string;
  engine?: 'remotion' | 'puppeteer';
  useBackgroundVideo?: boolean;
  debug?: boolean;
}

interface RenderBatchBody {
  definitionId?: string;
  engine?: 'remotion' | 'puppeteer';
  useBackgroundVideo?: boolean;
}

interface VideoQuerystring {
  engine?: 'remotion' | 'puppeteer';
}

interface RendersQuerystring {
  engine?: 'remotion' | 'puppeteer';
}

interface DeleteParams {
  fixtureId: string;
}

interface DeleteQuerystring {
  engine?: 'remotion' | 'puppeteer';
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function compositionTestsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {

  // ==========================================================================
  // FIXTURES
  // ==========================================================================

  /**
   * GET /api/composition-tests/fixtures - Lista wszystkich fixtures
   */
  fastify.get('/composition-tests/fixtures', async () => {
    return compositionTestService.getFixtures();
  });

  /**
   * GET /api/composition-tests/fixtures/:definitionId - Fixtures jednej kompozycji
   */
  fastify.get<{ Params: DefinitionIdParams }>(
    '/composition-tests/fixtures/:definitionId',
    async (request) => {
      const { definitionId } = request.params;
      return compositionTestService.getFixturesByDefinition(definitionId);
    }
  );

  // ==========================================================================
  // RENDER
  // ==========================================================================

  /**
   * POST /api/composition-tests/render - Renderuj pojedynczy fixture
   */
  fastify.post<{ Body: RenderBody }>(
    '/composition-tests/render',
    async (request, reply) => {
      const { fixtureId, engine = 'remotion', useBackgroundVideo, debug } = request.body;
      console.log(`[API] POST /render: fixtureId=${fixtureId}, engine=${engine}, useBackgroundVideo=${useBackgroundVideo} (type: ${typeof useBackgroundVideo}), debug=${debug}`);

      if (!fixtureId) {
        return reply.status(400).send({ error: 'Missing required field: fixtureId' });
      }

      try {
        const job = await compositionTestService.renderComposition(fixtureId, engine, useBackgroundVideo, debug);
        return reply.send({
          jobId: job.jobId,
          status: job.status,
          engine: job.engine,
          useBackgroundVideo: job.useBackgroundVideo,
          message: `Render started (engine: ${job.engine}${useBackgroundVideo ? ', background video' : ''})`,
        });
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to start render',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/composition-tests/render-batch - Renderuj wiele fixtures
   */
  fastify.post<{ Body: RenderBatchBody }>(
    '/composition-tests/render-batch',
    async (request, reply) => {
      const { definitionId, engine = 'remotion', useBackgroundVideo } = request.body || {};

      try {
        const batch = await compositionTestService.renderBatch(definitionId, engine, useBackgroundVideo);
        return reply.send({
          batchId: batch.batchId,
          status: batch.status,
          totalCount: batch.totalCount,
          message: `Batch render started (engine: ${engine})`,
        });
      } catch (error) {
        return reply.status(500).send({
          error: 'Failed to start batch render',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  // ==========================================================================
  // JOB STATUS
  // ==========================================================================

  /**
   * GET /api/composition-tests/jobs/:jobId - Status jednego joba
   */
  fastify.get<{ Params: JobIdParams }>(
    '/composition-tests/jobs/:jobId',
    async (request, reply) => {
      const { jobId } = request.params;
      const job = compositionTestService.getJob(jobId);

      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }

      return reply.send(job);
    }
  );

  /**
   * GET /api/composition-tests/batch/:batchId - Status batcha
   */
  fastify.get<{ Params: BatchIdParams }>(
    '/composition-tests/batch/:batchId',
    async (request, reply) => {
      const { batchId } = request.params;
      const batch = compositionTestService.getBatch(batchId);

      if (!batch) {
        return reply.status(404).send({ error: 'Batch not found' });
      }

      return reply.send(batch);
    }
  );

  // ==========================================================================
  // RENDERS MANAGEMENT
  // ==========================================================================

  /**
   * GET /api/composition-tests/renders - Lista wyrenderowanych plików
   * Query: ?engine=remotion|puppeteer (domyslnie: oba)
   */
  fastify.get<{ Querystring: RendersQuerystring }>(
    '/composition-tests/renders',
    async (request) => {
      const { engine } = request.query;
      return compositionTestService.getRenderedFiles(engine);
    }
  );

  /**
   * GET /api/composition-tests/renders/:fixtureId/video - Serwuj plik MP4
   * Query: ?engine=remotion|puppeteer (domyslnie: remotion)
   */
  fastify.get<{ Params: FixtureIdParams; Querystring: VideoQuerystring }>(
    '/composition-tests/renders/:fixtureId/video',
    async (request, reply) => {
      const { fixtureId } = request.params;
      const { engine = 'remotion' } = request.query;
      const filePath = path.join(compositionTestService.getRendersDir(engine), `${fixtureId}.mp4`);

      if (!fs.existsSync(filePath)) {
        return reply.status(404).send({ error: `Render not found (engine: ${engine})` });
      }

      const stat = fs.statSync(filePath);
      const stream = fs.createReadStream(filePath);

      return reply
        .type('video/mp4')
        .header('Content-Length', stat.size)
        .header('Accept-Ranges', 'bytes')
        .send(stream);
    }
  );

  /**
   * DELETE /api/composition-tests/renders/:fixtureId - Usuń renderowany plik
   * Query: ?engine=remotion|puppeteer (domyslnie: remotion)
   */
  fastify.delete<{ Params: DeleteParams; Querystring: DeleteQuerystring }>(
    '/composition-tests/renders/:fixtureId',
    async (request, reply) => {
      const { fixtureId } = request.params;
      const { engine = 'remotion' } = request.query;
      const deleted = compositionTestService.deleteRender(fixtureId, engine);

      if (!deleted) {
        return reply.status(404).send({ error: `Render not found (engine: ${engine})` });
      }

      return reply.send({ success: true, message: `Render deleted (engine: ${engine})` });
    }
  );
}
