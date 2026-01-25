/**
 * Results Routes - API endpoints dla wyników testów
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getResultsStore } from '../services/results-store';
import { getTestRunnerService } from '../services/test-runner';

export default async function resultsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  const resultsStore = getResultsStore();

  /**
   * GET /api/suites - lista wszystkich suite run'ów
   */
  fastify.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      tags?: string;
    };
  }>('/suites', async (request, reply) => {
    const { limit, offset, tags } = request.query;

    const suites = resultsStore.listSuiteRuns({
      limit: limit ? parseInt(limit) : 20,
      offset: offset ? parseInt(offset) : 0,
      tags: tags ? tags.split(',') : undefined,
    });

    return reply.send(suites);
  });

  /**
   * GET /api/suites/:id - szczegóły suite run'a
   */
  fastify.get<{ Params: { id: string } }>('/suites/:id', async (request, reply) => {
    const { id } = request.params;
    const suite = resultsStore.getSuiteRun(id);

    if (!suite) {
      return reply.status(404).send({ error: 'Suite not found' });
    }

    return reply.send(suite);
  });

  /**
   * GET /api/suites/:id/scenarios - lista scenariuszy w suite'ie
   */
  fastify.get<{ Params: { id: string } }>('/suites/:id/scenarios', async (request, reply) => {
    const { id } = request.params;

    // Pobierz statusy scenariuszy bezpośrednio z bazy danych
    const scenarios = resultsStore.getScenarioStatuses(id);

    if (scenarios.length === 0) {
      // Sprawdź czy suite w ogóle istnieje
      const suite = resultsStore.getSuiteRun(id);
      if (!suite) {
        return reply.status(404).send({ error: 'Suite not found' });
      }
    }

    return reply.send(scenarios);
  });

  /**
   * GET /api/suites/:id/scenarios/:scenarioId - szczegóły scenariusza
   */
  fastify.get<{ Params: { id: string; scenarioId: string } }>(
    '/suites/:id/scenarios/:scenarioId',
    async (request, reply) => {
      const { id, scenarioId } = request.params;
      const result = resultsStore.getScenarioResult(id, scenarioId);

      if (!result) {
        return reply.status(404).send({ error: 'Scenario result not found' });
      }

      return reply.send(result);
    }
  );

  /**
   * POST /api/suites/:id/tag - dodaj tag do suite'a
   */
  fastify.post<{ Params: { id: string }; Body: { tag: string } }>(
    '/suites/:id/tag',
    async (request, reply) => {
      const { id } = request.params;
      const { tag } = request.body || {};

      if (!tag) {
        return reply.status(400).send({ error: 'Tag is required' });
      }

      resultsStore.addTag(id, tag);
      return reply.send({ success: true, tag });
    }
  );

  /**
   * GET /api/suites/:id/compare/:otherId - porównanie dwóch suite'ów
   */
  fastify.get<{ Params: { id: string; otherId: string } }>(
    '/suites/:id/compare/:otherId',
    async (request, reply) => {
      const { id, otherId } = request.params;

      const suite1 = resultsStore.getSuiteRun(id);
      const suite2 = resultsStore.getSuiteRun(otherId);

      if (!suite1 || !suite2) {
        return reply.status(404).send({ error: 'One or both suites not found' });
      }

      // Porównaj wyniki scenariuszy
      const comparison: {
        scenarioId: string;
        suite1: { passed: boolean; tokens: number; latencyMs: number } | null;
        suite2: { passed: boolean; tokens: number; latencyMs: number } | null;
        change: 'fixed' | 'regressed' | 'unchanged' | 'new' | 'removed';
        tokensDiff?: number;
        tokensDiffPercent?: number;
      }[] = [];

      const suite1Results = new Map(suite1.results.map((r) => [r.scenarioId, r]));
      const suite2Results = new Map(suite2.results.map((r) => [r.scenarioId, r]));

      // Scenariusze z obu suite'ów
      const allScenarioIds = new Set([...suite1Results.keys(), ...suite2Results.keys()]);

      for (const scenarioId of allScenarioIds) {
        const r1 = suite1Results.get(scenarioId);
        const r2 = suite2Results.get(scenarioId);

        let change: 'fixed' | 'regressed' | 'unchanged' | 'new' | 'removed';
        if (!r1 && r2) {
          change = 'new';
        } else if (r1 && !r2) {
          change = 'removed';
        } else if (r1 && r2) {
          if (!r1.passed && r2.passed) {
            change = 'fixed';
          } else if (r1.passed && !r2.passed) {
            change = 'regressed';
          } else {
            change = 'unchanged';
          }
        } else {
          continue;
        }

        const tokensDiff = r1 && r2 ? r2.metrics.totalTokens - r1.metrics.totalTokens : undefined;
        const tokensDiffPercent =
          r1 && r2 && r1.metrics.totalTokens > 0
            ? ((r2.metrics.totalTokens - r1.metrics.totalTokens) / r1.metrics.totalTokens) * 100
            : undefined;

        comparison.push({
          scenarioId,
          suite1: r1
            ? { passed: r1.passed, tokens: r1.metrics.totalTokens, latencyMs: r1.metrics.latencyMs }
            : null,
          suite2: r2
            ? { passed: r2.passed, tokens: r2.metrics.totalTokens, latencyMs: r2.metrics.latencyMs }
            : null,
          change,
          tokensDiff,
          tokensDiffPercent,
        });
      }

      return reply.send({
        suite1: {
          id: suite1.id,
          createdAt: suite1.createdAt,
          tags: suite1.tags,
          summary: suite1.summary,
        },
        suite2: {
          id: suite2.id,
          createdAt: suite2.createdAt,
          tags: suite2.tags,
          summary: suite2.summary,
        },
        comparison,
        totalTokensDiff: suite2.totalTokens - suite1.totalTokens,
        totalTokensDiffPercent:
          suite1.totalTokens > 0
            ? ((suite2.totalTokens - suite1.totalTokens) / suite1.totalTokens) * 100
            : 0,
      });
    }
  );

  /**
   * GET /api/trends/:scenarioId - historia scenariusza przez wszystkie suite'y
   */
  fastify.get<{ Params: { scenarioId: string }; Querystring: { limit?: string } }>(
    '/trends/:scenarioId',
    async (request, reply) => {
      const { scenarioId } = request.params;
      const { limit } = request.query;

      const history = resultsStore.getScenarioHistory(scenarioId, limit ? parseInt(limit) : 20);

      return reply.send({
        scenarioId,
        history,
      });
    }
  );

  /**
   * GET /api/suites/:id/export - eksportuj suite do JSON
   */
  fastify.get<{ Params: { id: string } }>('/suites/:id/export', async (request, reply) => {
    const { id } = request.params;
    const exported = resultsStore.exportSuiteToJson(id);

    if (!exported) {
      return reply.status(404).send({ error: 'Suite not found' });
    }

    return reply
      .header('Content-Type', 'application/json')
      .header('Content-Disposition', `attachment; filename="suite-${id.substring(0, 8)}.json"`)
      .send(exported);
  });

  /**
   * GET /api/tools/:toolName/scenarios - scenariusze używające danego narzędzia
   */
  fastify.get<{ Params: { toolName: string }; Querystring: { limit?: string } }>(
    '/tools/:toolName/scenarios',
    async (request, reply) => {
      const { toolName } = request.params;
      const { limit } = request.query;

      const scenarios = resultsStore.getScenariosByToolName(toolName, limit ? parseInt(limit) : 50);

      return reply.send({
        toolName,
        scenarios,
      });
    }
  );

  /**
   * POST /api/suites/:id/stop - zatrzymaj suite
   */
  fastify.post<{ Params: { id: string } }>('/suites/:id/stop', async (request, reply) => {
    const { id } = request.params;

    // Sprawdź czy suite istnieje i jest running
    const suite = resultsStore.getSuiteRun(id);
    if (!suite) {
      return reply.status(404).send({ error: 'Suite not found' });
    }
    if (suite.status !== 'running') {
      return reply.status(400).send({ error: 'Suite is not running', currentStatus: suite.status });
    }

    const testRunner = getTestRunnerService();
    const result = await testRunner.stopSuite(id);

    return {
      success: result.success,
      suiteId: id,
      currentScenario: result.currentScenario,
      remainingScenarios: result.remainingScenarios,
      message: result.success
        ? 'Stopping suite. Current scenario will complete.'
        : 'Suite not found in queue',
    };
  });

  /**
   * DELETE /api/suites/:id - usuń suite
   */
  fastify.delete<{ Params: { id: string } }>('/suites/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = resultsStore.deleteSuiteRun(id);

    if (!deleted) {
      return reply.status(404).send({ error: 'Suite not found' });
    }

    return reply.send({ success: true });
  });
}
