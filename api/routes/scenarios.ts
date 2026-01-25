/**
 * Scenarios Routes - API endpoints dla scenariuszy
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import path from 'path';
import fs from 'fs';
import { getTestRunnerService } from '../services/test-runner';
import { getResultsStore } from '../services/results-store';
import type { TestScenario, SystemPromptConfig } from '../../agent-evals/types/scenario';

// Ścieżka do głównego katalogu projektu (relatywna do __dirname)
// testing/api/routes/ -> ../../../ -> główny katalog projektu
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Rekursywnie przeszukuje katalog w poszukiwaniu plików .scenario.ts
 */
function findScenarioFilesRecursive(
  dir: string,
  relativePath: string = ''
): { filePath: string; relativePath: string }[] {
  const results: { filePath: string; relativePath: string }[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const entryRelativePath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...findScenarioFilesRecursive(fullPath, entryRelativePath));
    } else if (entry.name.endsWith('.scenario.ts')) {
      results.push({
        filePath: fullPath,
        relativePath: entryRelativePath.replace('.scenario.ts', ''),
      });
    }
  }

  return results;
}

async function loadScenario(scenarioPath: string): Promise<TestScenario | null> {
  const fullPath = path.join(
    PROJECT_ROOT,
    'testing/agent-evals/scenarios',
    `${scenarioPath}.scenario.ts`
  );

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  try {
    const module = await import(fullPath);
    return module.scenario || module.default;
  } catch {
    return null;
  }
}

async function loadScenariosForAgent(agentType: string): Promise<TestScenario[]> {
  const indexPath = path.join(
    PROJECT_ROOT,
    'testing/agent-evals/scenarios',
    agentType,
    'index.ts'
  );

  if (!fs.existsSync(indexPath)) {
    return [];
  }

  try {
    const module = await import(indexPath);
    if (Array.isArray(module.default)) {
      return module.default;
    }

    const scenarios: TestScenario[] = [];
    for (const value of Object.values(module)) {
      if (
        value &&
        typeof value === 'object' &&
        'id' in value &&
        'name' in value &&
        'agent' in value
      ) {
        scenarios.push(value as TestScenario);
      }
    }
    return scenarios;
  } catch {
    return [];
  }
}

function listScenarioFiles(): { agent: string; id: string; path: string }[] {
  const scenariosDir = path.join(PROJECT_ROOT, 'testing/agent-evals/scenarios');
  const results: { agent: string; id: string; path: string }[] = [];

  if (!fs.existsSync(scenariosDir)) {
    return results;
  }

  // Pobierz katalogi agentów (pierwszy poziom)
  const agents = fs.readdirSync(scenariosDir).filter((f) => {
    const stat = fs.statSync(path.join(scenariosDir, f));
    return stat.isDirectory() && !f.startsWith('.');
  });

  // Dla każdego agenta szukaj scenariuszy rekursywnie
  for (const agent of agents) {
    const agentDir = path.join(scenariosDir, agent);
    const scenarioFiles = findScenarioFilesRecursive(agentDir);

    for (const file of scenarioFiles) {
      // relativePath już nie zawiera .scenario.ts
      const id = file.relativePath;
      results.push({
        agent,
        id,
        path: `${agent}/${id}`,
      });
    }
  }

  return results;
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function scenariosRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  const testRunner = getTestRunnerService();

  /**
   * GET /api/scenarios - lista wszystkich scenariuszy
   */
  fastify.get('/scenarios', async (_request, reply) => {
    const files = listScenarioFiles();

    // Załaduj metadane scenariuszy
    const scenarios = await Promise.all(
      files.map(async (f) => {
        const scenario = await loadScenario(f.path);
        if (!scenario) {
          return {
            path: f.path,
            agent: f.agent,
            id: f.id,
            name: f.id,
            available: false,
          };
        }
        return {
          path: f.path,
          agent: scenario.agent,
          id: scenario.id,
          name: scenario.name,
          description: scenario.description,
          tags: scenario.tags,
          available: true,
        };
      })
    );

    return reply.send(scenarios);
  });

  /**
   * GET /api/scenarios/:agent/* - szczegóły scenariusza (obsługuje podfoldery)
   * np. /api/scenarios/montage/move-blocks/move-later
   */
  fastify.get<{ Params: { agent: string; '*': string } }>(
    '/scenarios/:agent/*',
    async (request, reply) => {
      const scenarioPath = `${request.params.agent}/${request.params['*']}`;
      const scenario = await loadScenario(scenarioPath);

      if (!scenario) {
        return reply.status(404).send({ error: 'Scenario not found' });
      }

      return reply.send(scenario);
    }
  );

  /**
   * POST /api/scenarios/run-suite - uruchom zestaw scenariuszy
   */
  fastify.post<{
    Body: {
      agent?: string;
      scenarioIds?: string[];
      tags?: string[];
      verbose?: boolean;
      systemPrompt?: SystemPromptConfig;
      model?: 'haiku' | 'sonnet' | 'opus';
      thinkingMode?: 'think' | 'hard' | 'harder' | 'ultrathink';
      enabledTools?: string[];
      disabledTools?: string[];
      toolDescriptions?: Record<string, string>;
      toolParameterDescriptions?: Record<string, Record<string, string>>;
    };
  }>('/scenarios/run-suite', async (request, reply) => {
    const {
      agent,
      scenarioIds,
      tags,
      verbose,
      systemPrompt,
      model,
      thinkingMode,
      enabledTools,
      disabledTools,
      toolDescriptions,
      toolParameterDescriptions,
    } = request.body || {};

    // Diagnostyka - do usunięcia po zdiagnozowaniu problemu
    console.log('[API run-suite] systemPrompt received:', systemPrompt ? 'YES' : 'NO');
    if (systemPrompt) {
      console.log('[API run-suite] systemPrompt.raw length:', systemPrompt.raw?.length);
      console.log('[API run-suite] systemPrompt.mode:', systemPrompt.mode);
    }

    let scenarios: TestScenario[] = [];

    if (agent) {
      scenarios = await loadScenariosForAgent(agent);
    } else if (scenarioIds && scenarioIds.length > 0) {
      for (const id of scenarioIds) {
        const scenario = await loadScenario(id);
        if (scenario) {
          scenarios.push(scenario);
        }
      }
    }

    // Filtruj po tagach
    if (tags && tags.length > 0) {
      scenarios = scenarios.filter((s) => s.tags?.some((t) => tags.includes(t)));
    }

    if (scenarios.length === 0) {
      return reply.status(400).send({ error: 'No scenarios found' });
    }

    // Generuj jobId przed utworzeniem suite
    const jobId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Najpierw utwórz suite w bazie (status: running)
    const resultsStore = getResultsStore();
    const scenarioNames: Record<string, string> = {};
    for (const s of scenarios) {
      scenarioNames[s.id] = s.name;
    }
    const suiteRun = resultsStore.createSuiteRun({
      jobId,
      scenarioIds: scenarios.map((s) => s.id),
      scenarioNames,
      tags: ['api-triggered'],
      label: scenarios.length === 1
        ? `Single: ${scenarios[0].name}`
        : `Suite: ${scenarios.length} scenarios`,
      configSnapshot: {
        model,
        thinkingMode,
        enabledTools,
        disabledTools,
        systemPromptSource: systemPrompt
          ? (systemPrompt.raw ? 'custom-raw' : 'custom-file')
          : 'default',
        systemPromptMode: systemPrompt?.mode,
        systemPromptRaw: systemPrompt?.raw,
        toolDescriptions,
        toolParameterDescriptions,
      },
    });

    // Enqueue test z suiteId i jobId
    await testRunner.enqueueTest(
      scenarios,
      {
        verbose,
        systemPrompt,
        model,
        thinkingMode,
        enabledTools,
        disabledTools,
        toolDescriptions,
        toolParameterDescriptions,
      },
      suiteRun.id,
      jobId
    );

    return reply.send({
      jobId,
      suiteId: suiteRun.id,
      scenarioCount: scenarios.length,
      scenarioIds: scenarios.map((s) => s.id),
      message: 'Suite enqueued',
    });
  });

  /**
   * GET /api/jobs/:jobId - status joba
   */
  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId', async (request, reply) => {
    const { jobId } = request.params;
    const status = await testRunner.getJobStatus(jobId);

    if (!status) {
      return reply.status(404).send({ error: 'Job not found' });
    }

    return reply.send(status);
  });

  /**
   * GET /api/jobs/:jobId/result - wynik joba
   */
  fastify.get<{ Params: { jobId: string } }>('/jobs/:jobId/result', async (request, reply) => {
    const { jobId } = request.params;
    const result = await testRunner.getJobResult(jobId);

    if (!result) {
      return reply.status(404).send({ error: 'Job not found or not completed' });
    }

    return reply.send(result);
  });

  /**
   * GET /api/queue/stats - statystyki kolejki
   */
  fastify.get('/queue/stats', async (_request, reply) => {
    const stats = await testRunner.getQueueStats();
    return reply.send(stats);
  });

}
