/**
 * Claude Vision Routes - Endpointy do testowania pipeline'u Claude Vision
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { claudeVisionTestService, ClaudeVisionTestRequest } from '../services/claude-vision-test-service';
import { getClaudeVisionTestStore } from '../services/claude-vision-test-store';

export default async function claudeVisionRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  const store = getClaudeVisionTestStore();

  /**
   * GET /api/claude-vision/default-prompt
   * Zwraca domyślne prompty używane do analizy scen
   */
  fastify.get('/claude-vision/default-prompt', async () => {
    return {
      prompt: claudeVisionTestService.getDefaultPrompt(),
      systemPrompt: claudeVisionTestService.getDefaultSystemPrompt(),
    };
  });

  /**
   * POST /api/claude-vision/analyze
   * Uruchamia analizę: sprite generation + Claude Vision query
   * Automatycznie zapisuje wynik do bazy
   */
  fastify.post<{ Body: ClaudeVisionTestRequest }>(
    '/claude-vision/analyze',
    {
      config: {
        // 5 minut timeout na request
      },
      schema: {
        body: {
          type: 'object',
          required: ['videoPath'],
          properties: {
            videoPath: { type: 'string' },
            prompt: { type: 'string' },
            model: { type: 'string' },
            frameWidth: { type: 'number' },
            maxFrames: { type: 'number' },
            systemPrompt: { type: 'string' },
            systemPromptMode: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        // Ustaw timeout na odpowiedź (5 minut)
        reply.raw.setTimeout(300000);

        const result = await claudeVisionTestService.analyze(request.body);

        // Zapisz wynik do bazy
        const savedRecord = await store.saveTest(result, request.body);

        // Zwróć wynik z ID zapisanego rekordu
        return {
          ...result,
          savedTestId: savedRecord.id,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        reply.status(500).send({ error: message });
      }
    }
  );

  /**
   * GET /api/claude-vision/tests
   * Lista testów z paginacją i filtrowaniem
   */
  fastify.get<{
    Querystring: { limit?: string; offset?: string; model?: string };
  }>('/claude-vision/tests', async (request) => {
    const { limit, offset, model } = request.query;
    const tests = store.listTests({
      limit: limit ? parseInt(limit, 10) : 20,
      offset: offset ? parseInt(offset, 10) : 0,
      model,
    });
    return { tests };
  });

  /**
   * GET /api/claude-vision/tests/:id
   * Szczegóły testu (bez sprite base64)
   */
  fastify.get<{ Params: { id: string } }>('/claude-vision/tests/:id', async (request, reply) => {
    const test = store.getTest(request.params.id);
    if (!test) {
      return reply.status(404).send({ error: 'Test not found' });
    }
    return test;
  });

  /**
   * GET /api/claude-vision/tests/:id/sprite
   * Sprite base64
   */
  fastify.get<{ Params: { id: string } }>('/claude-vision/tests/:id/sprite', async (request, reply) => {
    const base64 = await store.getSpriteBase64(request.params.id);
    if (!base64) {
      return reply.status(404).send({ error: 'Sprite not found' });
    }
    return { base64 };
  });

  /**
   * GET /api/claude-vision/tests/:id/config
   * Tylko konfiguracja testu (do załadowania)
   */
  fastify.get<{ Params: { id: string } }>('/claude-vision/tests/:id/config', async (request, reply) => {
    const config = store.getTestConfig(request.params.id);
    if (!config) {
      return reply.status(404).send({ error: 'Test not found' });
    }
    return config;
  });

  /**
   * DELETE /api/claude-vision/tests/:id
   * Usuwa test + plik sprite
   */
  fastify.delete<{ Params: { id: string } }>('/claude-vision/tests/:id', async (request, reply) => {
    const deleted = await store.deleteTest(request.params.id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Test not found' });
    }
    return { success: true };
  });

  /**
   * POST /api/claude-vision/tests/:id/label
   * Aktualizacja etykiety
   */
  fastify.post<{
    Params: { id: string };
    Body: { label: string | null };
  }>('/claude-vision/tests/:id/label', async (request, reply) => {
    const updated = store.updateLabel(request.params.id, request.body.label);
    if (!updated) {
      return reply.status(404).send({ error: 'Test not found' });
    }
    return { success: true };
  });
}
