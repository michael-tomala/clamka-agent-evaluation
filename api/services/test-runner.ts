/**
 * Test Runner Service - uruchamia scenariusze testowe z BullMQ
 */

import path from 'path';
import { Queue, Worker, Job } from 'bullmq';
import { EventEmitter } from 'events';
import { getRedisConnection } from '../config/redis';
import { AgentTestHarness, summarizeResults } from '../../agent-evals/harness/test-harness';
import { getResultsStore } from './results-store';
import { initializeElectronEnvWithPath } from '../../../desktop-app/electron/utils/electronEnv';
import type { TestScenario, TestResult, ToolCall, RawMessage, SystemPromptConfig, TransAgentPromptConfig, SubagentPromptConfig } from '../../agent-evals/types/scenario';

// ============================================================================
// TYPES
// ============================================================================

export interface TestJob {
  id: string;
  type: 'single' | 'suite';
  scenarios: TestScenario[];
  /** ID suite'a powiązanego z tym jobem */
  suiteId?: string;
  options?: {
    verbose?: boolean;
    /** System prompt dla całego suite'a (nadpisuje prompt scenariusza jeśli nie ma własnego) */
    systemPrompt?: SystemPromptConfig;
    /** Model do użycia (haiku/sonnet/opus) */
    model?: 'haiku' | 'sonnet' | 'opus';
    /** Tryb myślenia (think/hard/harder/ultrathink) */
    thinkingMode?: 'think' | 'hard' | 'harder' | 'ultrathink';
    /** Lista włączonych narzędzi (null = wszystkie) */
    enabledTools?: string[];
    /** Lista wyłączonych narzędzi (alternatywa do enabledTools) */
    disabledTools?: string[];
    /** Custom opisy narzędzi (nadpisują domyślne) */
    toolDescriptions?: Record<string, string>;
    /** Custom opisy parametrów narzędzi (nadpisują domyślne) */
    toolParameterDescriptions?: Record<string, Record<string, string>>;
    /** Custom prompty dla trans agentów */
    transAgentPrompts?: Record<string, TransAgentPromptConfig>;
    /** Włączone narzędzia dla trans agentów (klucz = typ, wartość = lista nazw narzędzi) */
    transAgentEnabledTools?: Record<string, string[]>;
    /** Custom konfiguracja subagentów (Task tool) */
    subagentPrompts?: Record<string, SubagentPromptConfig>;
  };
}

export interface TestJobProgress {
  jobId: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  currentScenario?: string;
  completedScenarios: number;
  totalScenarios: number;
  results: TestResult[];
  toolCalls: ToolCall[];
}

export type TestEvent =
  | { type: 'job:start'; jobId: string; suiteId?: string; totalScenarios: number }
  | { type: 'scenario:start'; jobId: string; suiteId?: string; scenarioId: string; scenarioName: string }
  | { type: 'tool:call'; jobId: string; suiteId?: string; scenarioId: string; toolCall: ToolCall }
  | { type: 'message:received'; jobId: string; suiteId?: string; scenarioId: string; message: RawMessage }
  | { type: 'scenario:complete'; jobId: string; suiteId?: string; scenarioId: string; result: TestResult }
  | { type: 'job:complete'; jobId: string; suiteId?: string; summary: ReturnType<typeof summarizeResults> }
  | { type: 'job:error'; jobId: string; suiteId?: string; error: string }
  | { type: 'suite:stopped'; jobId: string; suiteId?: string; completedScenarios: number; totalScenarios: number };

// ============================================================================
// TEST RUNNER SERVICE
// ============================================================================

export class TestRunnerService extends EventEmitter {
  private queue: Queue<TestJob>;
  private worker: Worker<TestJob, TestResult[]> | null = null;
  private harness: AgentTestHarness;
  private stoppedSuites = new Set<string>();

  constructor() {
    super();

    const connection = getRedisConnection();

    this.queue = new Queue<TestJob>('test-queue', {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
      },
    });

    this.harness = new AgentTestHarness({
      verbose: true,
    });
  }

  /**
   * Startuje worker do przetwarzania testów
   */
  startWorker(): void {
    if (this.worker) {
      console.log('[TestRunner] Worker already running');
      return;
    }

    const connection = getRedisConnection();

    this.worker = new Worker<TestJob, TestResult[]>(
      'test-queue',
      async (job: Job<TestJob>) => {
        return this.processJob(job);
      },
      {
        connection,
        concurrency: 1, // Jeden test na raz - zasobożerne
      }
    );

    this.worker.on('completed', (job, result) => {
      const summary = summarizeResults(result);
      const suiteId = job.data.suiteId;

      // Sprawdź czy suite był zatrzymany
      const wasStopped = suiteId ? this.stoppedSuites.has(suiteId) : false;
      if (suiteId && wasStopped) {
        this.stoppedSuites.delete(suiteId);
      }

      // Finalizuj lub zapisz wyniki do bazy i plików JSON
      try {
        if (suiteId) {
          // Finalizuj istniejący suite
          const finalStatus = wasStopped ? 'stopped' : 'completed';
          getResultsStore().finalizeSuiteRun(suiteId, result, finalStatus);
          console.log(`[TestRunner] Suite finalized: ${suiteId} (${finalStatus})`);
        } else {
          // Stara ścieżka - zapisz nowy suite (dla kompatybilności)
          const suiteRun = getResultsStore().saveSuiteRun(result, {
            tags: ['api-triggered'],
            label: job.data.scenarios.length === 1
              ? `Single: ${job.data.scenarios[0].name}`
              : `Suite: ${job.data.scenarios.length} scenarios`,
            configSnapshot: {
              model: job.data.options?.model,
              thinkingMode: job.data.options?.thinkingMode,
              enabledTools: job.data.options?.enabledTools,
              disabledTools: job.data.options?.disabledTools,
              systemPromptSource: job.data.options?.systemPrompt
                ? (job.data.options.systemPrompt.raw ? 'custom-raw' : 'custom-file')
                : 'default',
              transAgentPrompts: job.data.options?.transAgentPrompts,
              transAgentEnabledTools: job.data.options?.transAgentEnabledTools,
              subagentPrompts: job.data.options?.subagentPrompts,
            },
          });
          console.log(`[TestRunner] Results saved: ${suiteRun.id}`);
        }
      } catch (err) {
        console.error('[TestRunner] Failed to save results:', err);
      }

      this.emit('event', {
        type: 'job:complete',
        jobId: job.id!,
        suiteId,
        summary,
      } as TestEvent);
    });

    this.worker.on('failed', (job, err) => {
      const suiteId = job?.data.suiteId;

      // Jeśli mamy suiteId, oznacz jako failed
      if (suiteId) {
        try {
          getResultsStore().finalizeSuiteRun(suiteId, [], 'failed');
        } catch (e) {
          console.error('[TestRunner] Failed to mark suite as failed:', e);
        }
      }

      this.emit('event', {
        type: 'job:error',
        jobId: job?.id || 'unknown',
        suiteId,
        error: err.message,
      } as TestEvent);
    });

    console.log('[TestRunner] Worker started');
  }

  /**
   * Zatrzymuje worker
   */
  async stopWorker(): Promise<void> {
    if (this.worker) {
      await this.worker.close();
      this.worker = null;
      console.log('[TestRunner] Worker stopped');
    }
  }

  /**
   * Dodaje test do kolejki
   */
  async enqueueTest(
    scenarios: TestScenario[],
    options?: {
      verbose?: boolean;
      systemPrompt?: SystemPromptConfig;
      model?: 'haiku' | 'sonnet' | 'opus';
      thinkingMode?: 'think' | 'hard' | 'harder' | 'ultrathink';
      enabledTools?: string[];
      disabledTools?: string[];
      toolDescriptions?: Record<string, string>;
      toolParameterDescriptions?: Record<string, Record<string, string>>;
      transAgentPrompts?: Record<string, TransAgentPromptConfig>;
      transAgentEnabledTools?: Record<string, string[]>;
      subagentPrompts?: Record<string, SubagentPromptConfig>;
    },
    suiteId?: string,
    existingJobId?: string
  ): Promise<string> {
    const jobId = existingJobId || `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    const job = await this.queue.add(
      'run-test',
      {
        id: jobId,
        type: scenarios.length === 1 ? 'single' : 'suite',
        scenarios,
        suiteId,
        options,
      },
      {
        jobId,
      }
    );

    console.log(`[TestRunner] Enqueued job: ${job.id}${suiteId ? ` (suite: ${suiteId})` : ''}`);
    return job.id!;
  }

  /**
   * Pobiera status joba
   */
  async getJobStatus(jobId: string): Promise<TestJobProgress | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    const progress = (job.progress as Partial<TestJobProgress>) || {};

    return {
      jobId,
      status: state === 'active' ? 'running' : state === 'completed' ? 'completed' : state === 'failed' ? 'failed' : 'waiting',
      currentScenario: progress.currentScenario,
      completedScenarios: progress.completedScenarios || 0,
      totalScenarios: progress.totalScenarios || job.data.scenarios.length,
      results: progress.results || [],
      toolCalls: progress.toolCalls || [],
    };
  }

  /**
   * Pobiera wynik zakończonego joba
   */
  async getJobResult(jobId: string): Promise<TestResult[] | null> {
    const job = await this.queue.getJob(jobId);
    if (!job) return null;

    const state = await job.getState();
    if (state !== 'completed') return null;

    return job.returnvalue;
  }

  /**
   * Zatrzymuje suite - aktualny scenariusz się kończy, pozostałe są anulowane
   */
  async stopSuite(suiteId: string): Promise<{
    success: boolean;
    currentScenario?: string;
    remainingScenarios: number;
  }> {
    this.stoppedSuites.add(suiteId);

    // Pobierz aktywny job
    const jobs = await this.queue.getActive();
    const activeJob = jobs.find(j => j.data.suiteId === suiteId);

    if (!activeJob) {
      // Może być w waiting - usuń z kolejki
      const waitingJobs = await this.queue.getWaiting();
      const waitingJob = waitingJobs.find(j => j.data.suiteId === suiteId);
      if (waitingJob) {
        await waitingJob.remove();
        // Finalizuj jako stopped
        getResultsStore().finalizeSuiteRun(suiteId, [], 'stopped');
        return { success: true, remainingScenarios: waitingJob.data.scenarios.length };
      }
      return { success: false, remainingScenarios: 0 };
    }

    const progress = activeJob.progress as { completedScenarios?: number; currentScenario?: string };
    const completed = progress?.completedScenarios || 0;
    const remaining = activeJob.data.scenarios.length - completed - 1;

    return {
      success: true,
      currentScenario: progress?.currentScenario,
      remainingScenarios: Math.max(0, remaining),
    };
  }

  /**
   * Przetwarza job
   */
  private async processJob(job: Job<TestJob>): Promise<TestResult[]> {
    // Inicjalizuj ElectronEnv z poprawną ścieżką root projektu
    // (wymagane dla narzędzi Remotion które używają getAppPath())
    const projectRoot = path.resolve(__dirname, '../../../');
    initializeElectronEnvWithPath(projectRoot);

    const { scenarios, options, suiteId } = job.data;
    const results: TestResult[] = [];
    const allToolCalls: ToolCall[] = [];

    this.emit('event', {
      type: 'job:start',
      jobId: job.id!,
      suiteId,
      totalScenarios: scenarios.length,
    } as TestEvent);

    // Konfiguruj harness z callbackami
    // Używamy __dirname zamiast process.cwd() - __dirname to katalog pliku (testing/api/services/),
    // który jest stały niezależnie od gdzie uruchomimy skrypt
    const harness = new AgentTestHarness({
      verbose: options?.verbose,
      fixturesPath: path.join(__dirname, '../../agent-evals/fixtures'),
      defaultSystemPrompt: options?.systemPrompt,
      model: options?.model,
      thinkingMode: options?.thinkingMode,
      enabledTools: options?.enabledTools,
      disabledTools: options?.disabledTools,
      toolDescriptions: options?.toolDescriptions,
      toolParameterDescriptions: options?.toolParameterDescriptions,
      transAgentPrompts: options?.transAgentPrompts,
      transAgentEnabledTools: options?.transAgentEnabledTools,
      subagentPrompts: options?.subagentPrompts,
      onToolCall: (toolCall) => {
        allToolCalls.push(toolCall);
        this.emit('event', {
          type: 'tool:call',
          jobId: job.id!,
          suiteId,
          scenarioId: job.data.scenarios[results.length]?.id || 'unknown',
          toolCall,
        } as TestEvent);
      },
      onMessage: (message, scenarioId) => {
        this.emit('event', {
          type: 'message:received',
          jobId: job.id!,
          suiteId,
          scenarioId,
          message,
        } as TestEvent);
      },
      onTestComplete: (result) => {
        results.push(result);

        if (suiteId) {
          // Zapisz pełne wyniki scenariusza do bazy (real-time persistence)
          getResultsStore().saveScenarioResult(suiteId, result);

          // Aktualizuj live status (in-memory + status w bazie)
          getResultsStore().updateLiveStatus(suiteId, {
            scenarioStatus: { scenarioId: result.scenarioId, status: result.passed ? 'completed' : 'failed' },
          });
        }

        this.emit('event', {
          type: 'scenario:complete',
          jobId: job.id!,
          suiteId,
          scenarioId: result.scenarioId,
          result,
        } as TestEvent);

        // Update progress
        job.updateProgress({
          currentScenario: undefined,
          completedScenarios: results.length,
          totalScenarios: scenarios.length,
          results,
          toolCalls: allToolCalls,
        });
      },
    });

    for (const scenario of scenarios) {
      // Sprawdź czy suite został zatrzymany
      if (suiteId && this.stoppedSuites.has(suiteId)) {
        console.log(`[TestRunner] Suite ${suiteId} stopped - skipping remaining scenarios`);

        // Oznacz pozostałe scenariusze jako cancelled
        const currentIndex = scenarios.indexOf(scenario);
        for (let i = currentIndex; i < scenarios.length; i++) {
          getResultsStore().updateLiveStatus(suiteId, {
            scenarioStatus: { scenarioId: scenarios[i].id, status: 'cancelled' },
          });
        }

        this.emit('event', {
          type: 'suite:stopped',
          jobId: job.id!,
          suiteId,
          completedScenarios: results.length,
          totalScenarios: scenarios.length,
        } as TestEvent);

        break;
      }

      // Aktualizuj live status - scenariusz w trakcie
      if (suiteId) {
        getResultsStore().updateLiveStatus(suiteId, {
          currentScenario: scenario.id,
          scenarioStatus: { scenarioId: scenario.id, status: 'running' },
        });
      }

      this.emit('event', {
        type: 'scenario:start',
        jobId: job.id!,
        suiteId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
      } as TestEvent);

      job.updateProgress({
        currentScenario: scenario.name,
        completedScenarios: results.length,
        totalScenarios: scenarios.length,
        results,
        toolCalls: allToolCalls,
      });

      await harness.runScenario(scenario);
    }

    return results;
  }

  /**
   * Pobiera statystyki kolejki
   */
  async getQueueStats(): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
  }> {
    const [waiting, active, completed, failed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
    ]);

    return { waiting, active, completed, failed };
  }
}

// Singleton
let instance: TestRunnerService | null = null;

export function getTestRunnerService(): TestRunnerService {
  if (!instance) {
    instance = new TestRunnerService();
  }
  return instance;
}
