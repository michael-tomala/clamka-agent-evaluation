/**
 * Render Routes - API endpoints dla renderowania chapter'ów z fixtures
 *
 * Endpoints:
 * - POST /api/render/chapter - rozpocznij renderowanie
 * - GET /api/render/:jobId/status - status renderowania
 * - DELETE /api/render/:jobId - usuń render
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fastifyStatic from '@fastify/static';
import { renderService, RenderJob } from '../services/render-service';

// ============================================================================
// TYPES
// ============================================================================

interface RenderChapterBody {
  suiteId?: string;
  scenarioId?: string;
  projectId: string;
  chapterId: string;
  engine?: 'remotion' | 'puppeteer';
}

interface RenderJobParams {
  jobId: string;
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function renderRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  // Serwuj wyrenderowane pliki jako static
  await fastify.register(fastifyStatic, {
    root: renderService.getRendersDir(),
    prefix: '/renders/',
    decorateReply: false,  // Nie dekoruj reply (już zrobione przez inny plugin)
  });

  /**
   * POST /api/render/chapter - rozpocznij renderowanie chapter'a
   *
   * Body:
   * - suiteId: ID suite run (do załadowania snapshot)
   * - scenarioId: ID scenariusza (do załadowania snapshot)
   * - projectId: ID projektu
   * - chapterId: ID chaptera do wyrenderowania
   */
  fastify.post<{ Body: RenderChapterBody }>(
    '/render/chapter',
    async (request, reply) => {
      const { suiteId, scenarioId, projectId, chapterId, engine } = request.body;

      if (!projectId || !chapterId) {
        return reply.status(400).send({
          error: 'Missing required fields: projectId, chapterId',
        });
      }

      try {
        const renderEngine = engine ?? 'remotion';
        console.log(`[RenderRoutes] Starting render for chapter ${chapterId} (suite: ${suiteId ?? 'none'}, scenario: ${scenarioId ?? 'none'}, engine: ${renderEngine})`);
        const job = await renderService.renderChapter(suiteId ?? null, scenarioId ?? null, projectId, chapterId, renderEngine);

        return reply.send({
          jobId: job.jobId,
          status: job.status,
          message: 'Render started',
        });
      } catch (error) {
        console.error('[RenderRoutes] Error starting render:', error);
        return reply.status(500).send({
          error: 'Failed to start render',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/render/:jobId/status - status renderowania
   */
  fastify.get<{ Params: RenderJobParams }>(
    '/render/:jobId/status',
    async (request, reply) => {
      const { jobId } = request.params;

      const job = renderService.getJob(jobId);
      if (!job) {
        return reply.status(404).send({
          error: 'Render job not found',
        });
      }

      // Zwróć status bez previewFrame jeśli zbyt duży
      const response: Partial<RenderJob> & { videoUrl?: string } = {
        jobId: job.jobId,
        projectId: job.projectId,
        chapterId: job.chapterId,
        status: job.status,
        progress: job.progress,
        currentFrame: job.currentFrame,
        totalFrames: job.totalFrames,
        error: job.error,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
      };

      // Dodaj preview tylko jeśli nie jest zbyt stary
      if (job.previewFrame) {
        response.previewFrame = job.previewFrame;
      }

      // Dodaj URL do video jeśli zakończone
      if (job.status === 'completed' && job.outputPath) {
        response.videoUrl = `/api/renders/${job.jobId}.mp4`;
      }

      return reply.send(response);
    }
  );

  /**
   * DELETE /api/render/:jobId - usuń render
   */
  fastify.delete<{ Params: RenderJobParams }>(
    '/render/:jobId',
    async (request, reply) => {
      const { jobId } = request.params;

      const deleted = renderService.deleteRender(jobId);
      if (!deleted) {
        return reply.status(404).send({
          error: 'Render job not found',
        });
      }

      return reply.send({
        success: true,
        message: 'Render deleted',
      });
    }
  );
}
