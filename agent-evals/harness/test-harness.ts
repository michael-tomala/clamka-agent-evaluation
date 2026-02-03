/**
 * Agent Test Harness - główny runner testów agentów
 *
 * Uruchamia scenariusze testowe z JSON storage i śledzi wyniki.
 */

import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { JsonStorage } from '../storage/json-storage';
import { TestVectorStore } from '../storage/test-vector-store';
import { storageRegistry } from '../../../shared/storage';
import { semanticSearchService } from '../../../electron/services/vector/SemanticSearchService';
import { ToolTracker } from './tool-tracker';
import { checkExpectations } from './assertions';
import { TestableAgentAdapter, type AgentType } from './testable-agent-adapter';
import { evalStorageService } from '../../api/services/eval-storage-service';
import type {
  TestScenario,
  TestResult,
  TestMetrics,
  ToolCall,
  RawMessage,
  SystemPromptConfig,
  TransAgentPromptConfig,
  SubagentPromptConfig,
} from '../types/scenario';

// ============================================================================
// TEST HARNESS OPTIONS
// ============================================================================

export interface TestHarnessOptions {
  /** Ścieżka bazowa do fixtures JSON (domyślnie: testing/agent-evals/fixtures) */
  fixturesPath?: string;
  /**
   * Ścieżka do pliku fixtures.db (SQLite) dla fixtures tworzonych przez główną aplikację.
   * Domyślnie: testing/agent-evals/fixtures/clamka.db
   */
  fixturesDbPath?: string;
  /**
   * Ścieżka do katalogu LanceDB fixtures dla wyszukiwania wektorowego.
   * Domyślnie: testing/agent-evals/fixtures/lancedb
   * Jeśli katalog istnieje, TestVectorStore zostanie zainicjalizowany.
   */
  vectorFixturesPath?: string;
  /** Timeout dla pojedynczego testu w ms (domyślnie: 60000) */
  defaultTimeout?: number;
  /** Czy logować szczegóły do konsoli */
  verbose?: boolean;
  /** Callback wywoływany po każdym wywołaniu narzędzia */
  onToolCall?: (toolCall: ToolCall) => void;
  /** Callback wywoływany po zakończeniu testu */
  onTestComplete?: (result: TestResult) => void;
  /** Callback wywoływany dla każdej wiadomości (dla live streaming) */
  onMessage?: (message: RawMessage, scenarioId: string) => void;

  /** Domyślny system prompt dla wszystkich scenariuszy (nadpisywany przez prompt ze scenariusza) */
  defaultSystemPrompt?: SystemPromptConfig;

  // === OPCJE MODELU I NARZĘDZI ===

  /** Model do użycia (haiku/sonnet/opus) - domyślnie: sonnet */
  model?: 'haiku' | 'sonnet' | 'opus';
  /** Tryb myślenia (think/hard/harder/ultrathink) - domyślnie: think */
  thinkingMode?: 'think' | 'hard' | 'harder' | 'ultrathink';
  /** Lista włączonych narzędzi (null = wszystkie dozwolone dla agenta) */
  enabledTools?: string[];
  /** Lista wyłączonych narzędzi (alternatywa do enabledTools) */
  disabledTools?: string[];
  /** Custom opisy narzędzi (nadpisują domyślne) - zapisywane w snapshocie */
  toolDescriptions?: Record<string, string>;
  /** Custom opisy parametrów narzędzi (nadpisują domyślne) - zapisywane w snapshocie */
  toolParameterDescriptions?: Record<string, Record<string, string>>;
  /** Custom prompty dla trans agentów (klucz = typ np. 'media-scout') */
  transAgentPrompts?: Record<string, TransAgentPromptConfig>;
  /** Włączone narzędzia dla trans agentów (klucz = typ trans agenta, wartość = lista nazw narzędzi) */
  transAgentEnabledTools?: Record<string, string[]>;
  /**
   * Custom konfiguracja subagentów (Task tool)
   * Klucz = typ subagenta (np. 'chapter-explorator', 'web-researcher', 'script-segments-editor')
   */
  subagentPrompts?: Record<string, SubagentPromptConfig>;

  // === OPCJE ZAPISU DO BAZY DANYCH ===

  /** Czy zapisywać wyniki do bazy danych SQLite */
  saveResults?: boolean;
  /** Tagi dla przebiegu testów (np. ['montage', 'v1.5']) */
  tags?: string[];
  /** Etykieta przebiegu (np. 'Baseline before refactor') */
  label?: string;
  /** Snapshot konfiguracji (prompty, modele, etc.) */
  configSnapshot?: Record<string, unknown>;
}

// ============================================================================
// AGENT INTERFACE (dla dependency injection)
// ============================================================================

export interface ITestableAgent {
  /** Nazwa agenta */
  name: string;
  /** Wysyła wiadomość do agenta i czeka na odpowiedź */
  chat(
    threadId: string,
    message: string,
    options: { model?: string },
    context?: Record<string, unknown>,
    onMessage?: (message: RawMessage) => void
  ): Promise<{
    response: string;
    metrics: {
      inputTokens: number;
      outputTokens: number;
      turnCount: number;
    };
    messages: RawMessage[];
  }>;
  /** Zwraca narzędzia agenta (do opakowania przez ToolTracker) */
  getTools(): Record<string, (...args: unknown[]) => unknown>;
  /** Ustawia opakowane narzędzia */
  setTools(tools: Record<string, (...args: unknown[]) => unknown>): void;
  /** Zwraca częściowe metryki (dla partial results przy timeout) */
  getPartialMetrics?(): { inputTokens: number; outputTokens: number; turnCount: number };
  /** Anuluje bieżącą operację agenta (używane przy timeout) */
  cancel?(): void;
}

// ============================================================================
// HELPER: Extract SDK built-in tool calls from messages
// ============================================================================

/**
 * Wyciąga wywołania narzędzi SDK (Task, TodoWrite, WebSearch, WebFetch, etc.)
 * z wiadomości agenta. SDK tools nie przechodzą przez toolWrapper/tracker,
 * więc muszą być wyciągnięte bezpośrednio z bloków tool_use w messages.
 */
function extractToolCallsFromMessages(messages: RawMessage[]): ToolCall[] {
  const toolCalls: ToolCall[] = [];

  for (const msg of messages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === 'tool_use') {
          toolCalls.push({
            toolName: block.name as string,
            input: block.input as Record<string, unknown>,
            output: undefined, // SDK tools nie mają output w tym samym bloku
            timestamp: msg.timestamp,
            order: toolCalls.length,
            durationMs: 0,
          });
        }
      }
    }
  }

  return toolCalls;
}

// ============================================================================
// TEST HARNESS
// ============================================================================

// Typ dla Required<TestHarnessOptions> z opcjonalnymi polami bazy danych
type RequiredHarnessOptions = Required<Pick<TestHarnessOptions,
  'fixturesPath' | 'fixturesDbPath' | 'vectorFixturesPath' | 'defaultTimeout' | 'verbose' | 'onToolCall' | 'onTestComplete'
>> & Pick<TestHarnessOptions,
  'saveResults' | 'tags' | 'label' | 'configSnapshot' | 'onMessage' | 'defaultSystemPrompt' |
  'model' | 'thinkingMode' | 'enabledTools' | 'disabledTools' | 'toolDescriptions' | 'toolParameterDescriptions' |
  'transAgentPrompts' | 'transAgentEnabledTools' | 'subagentPrompts'
>;

export class AgentTestHarness {
  private options: RequiredHarnessOptions;
  private storage: JsonStorage | null = null;
  private currentSuiteRunId: string | null = null;

  constructor(options: TestHarnessOptions = {}) {
    this.options = {
      fixturesPath: options.fixturesPath || path.join(__dirname, '../fixtures'),
      fixturesDbPath: options.fixturesDbPath || path.join(__dirname, '../fixtures/clamka.db'),
      vectorFixturesPath: options.vectorFixturesPath || path.join(__dirname, '../fixtures/lancedb'),
      defaultTimeout: options.defaultTimeout || 60000,
      verbose: options.verbose || false,
      onToolCall: options.onToolCall || (() => {}),
      onTestComplete: options.onTestComplete || (() => {}),
      onMessage: options.onMessage,
      defaultSystemPrompt: options.defaultSystemPrompt,
      // Opcje modelu i narzędzi
      model: options.model,
      thinkingMode: options.thinkingMode,
      enabledTools: options.enabledTools,
      disabledTools: options.disabledTools,
      toolDescriptions: options.toolDescriptions,
      toolParameterDescriptions: options.toolParameterDescriptions,
      transAgentPrompts: options.transAgentPrompts,
      transAgentEnabledTools: options.transAgentEnabledTools,
      subagentPrompts: options.subagentPrompts,
      // Opcje bazy danych
      saveResults: options.saveResults,
      tags: options.tags,
      label: options.label,
      configSnapshot: options.configSnapshot,
    };
  }

  /**
   * Uruchamia pojedynczy scenariusz testowy
   */
  async runScenario(scenario: TestScenario): Promise<TestResult> {
    const testId = uuidv4();
    const startedAt = new Date().toISOString();

    this.log(`Starting scenario: ${scenario.name} (${scenario.id})`);

    // Zmienne zadeklarowane przed try - dostępne w catch dla partial results
    let tracker: ToolTracker | null = null;
    let agent: TestableAgentAdapter | null = null;
    let beforeSnapshot: ReturnType<JsonStorage['getSnapshot']> | null = null;

    try {
      // 1. Załaduj fixtures do JSON storage
      this.storage = new JsonStorage();

      // Używamy ID z input.context - ładujemy z wspólnej bazy fixtures.db
      const { projectId, chapterId } = scenario.input.context;
      await this.storage.loadFromSqliteDb(
        projectId,
        chapterId || null,
        this.options.fixturesDbPath
      );
      this.log(`Loaded SQLite fixtures for project: ${projectId}`);

      // 1b. Załaduj LanceDB fixtures dla wyszukiwania wektorowego (jeśli istnieją)
      if (fs.existsSync(this.options.vectorFixturesPath)) {
        const testVectorStore = new TestVectorStore(this.options.vectorFixturesPath);
        await testVectorStore.initialize();
        semanticSearchService.setVectorStore(testVectorStore);
        this.log(`Loaded LanceDB fixtures from: ${this.options.vectorFixturesPath}`);
      }

      beforeSnapshot = this.storage.getSnapshot();

      // 2. Utwórz tracker narzędzi
      tracker = new ToolTracker();

      // 3. Sprawdź typ agenta
      const agentType = scenario.agent as AgentType;
      if (agentType !== 'montage' && agentType !== 'script') {
        throw new Error(`Unknown agent type: ${scenario.agent}. Expected 'montage' or 'script'.`);
      }

      // 4. Utwórz adapter agenta (automatycznie wstrzykuje JsonStorage do StorageRegistry)
      // Użyj prompt ze scenariusza LUB defaultSystemPrompt z harness
      const effectivePrompt = scenario.systemPrompt || this.options.defaultSystemPrompt;
      agent = new TestableAgentAdapter(
        agentType,
        this.storage,
        tracker,
        effectivePrompt,
        {
          enabledTools: this.options.enabledTools,
          disabledTools: this.options.disabledTools,
          toolDescriptions: this.options.toolDescriptions,
          toolParameterDescriptions: this.options.toolParameterDescriptions,
          transAgentPrompts: this.options.transAgentPrompts,
          transAgentEnabledTools: this.options.transAgentEnabledTools,
          subagentPrompts: this.options.subagentPrompts,
        }
      );

      // 5. Uruchom agenta z timeoutem
      const timeout = scenario.timeout || this.options.defaultTimeout;

      // Callback dla live streaming wiadomości
      const messageCallback = this.options.onMessage
        ? (msg: RawMessage) => this.options.onMessage!(msg, scenario.id)
        : undefined;

      // Użyj model i thinkingMode z opcji harness (domyślnie sonnet/think)
      const effectiveModel = this.options.model || 'sonnet';
      const effectiveThinkingMode = this.options.thinkingMode || 'think';

      const agentResult = await this.runWithTimeout(
        agent.chat(
          `test-thread-${testId}`,
          scenario.input.userMessage,
          { model: effectiveModel, thinkingMode: effectiveThinkingMode },
          scenario.input.context,
          messageCallback
        ),
        timeout,
        agent // przekaż agenta do runWithTimeout dla cancel przy timeout
      );

      // 6. Zbierz wyniki
      const afterSnapshot = this.storage.getSnapshot();

      // Zbierz tool calls z OBU źródeł:
      // 1. MCP tools z tracker (mają pełne input/output/timing)
      // 2. SDK built-in tools z messages (tylko tool_use blocks - Task, TodoWrite, WebSearch, etc.)
      const mcpToolCalls = tracker.getCalls();
      const sdkToolCalls = extractToolCallsFromMessages(agentResult.messages);

      // Połącz, ale unikaj duplikatów (MCP tools mogą być w obu źródłach)
      const mcpToolNames = new Set(mcpToolCalls.map(c => c.toolName));
      const uniqueSdkCalls = sdkToolCalls.filter(c => !mcpToolNames.has(c.toolName));
      const toolCalls = [...mcpToolCalls, ...uniqueSdkCalls];

      const dataDiff = this.storage.diff(beforeSnapshot, afterSnapshot);

      // 7. Wywołaj callback dla każdego tool call
      for (const call of toolCalls) {
        this.options.onToolCall(call);
      }

      // 8. Sprawdź oczekiwania
      const { assertions, allPassed } = checkExpectations(
        scenario.expectations,
        toolCalls,
        dataDiff,
        agentResult.response
      );

      // 9. Zbuduj wynik
      const completedAt = new Date().toISOString();
      const metrics: TestMetrics = {
        inputTokens: agentResult.metrics.inputTokens,
        outputTokens: agentResult.metrics.outputTokens,
        totalTokens: agentResult.metrics.inputTokens + agentResult.metrics.outputTokens,
        latencyMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
        turnCount: agentResult.metrics.turnCount,
      };

      // Pobierz informacje o prompcie
      const promptInfo = agent.getResolvedPromptInfo();

      // Pobierz logi stderr z Claude CLI
      const stderrLogs = agent.getCollectedStderrLogs();

      // System prompt jako pierwsza wiadomość (pełny snapshot konwersacji)
      const systemMessageEntry: RawMessage = {
        role: 'system',
        timestamp: new Date(startedAt).getTime(),
        content: [{ type: 'text', text: promptInfo?.resolvedPrompt || '' }],
      };

      // Wiadomość użytkownika jako druga
      const userMessageEntry: RawMessage = {
        role: 'user',
        timestamp: new Date(startedAt).getTime(),
        content: [{ type: 'text', text: scenario.input.userMessage }],
      };

      const fullMessages = [systemMessageEntry, userMessageEntry, ...agentResult.messages];

      const result: TestResult = {
        id: testId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: allPassed,
        toolCalls,
        dataDiff,
        assertions,
        metrics,
        agentResponse: agentResult.response,
        startedAt,
        completedAt,
        messages: fullMessages,
        systemPromptInfo: promptInfo
          ? {
              source: promptInfo.source,
              sourceFile: promptInfo.sourceFile,
              patches: promptInfo.patches,
              content: promptInfo.rawPrompt,
              resolvedContent: promptInfo.resolvedPrompt,
            }
          : undefined,
        userMessage: scenario.input.userMessage,
        inputContext: scenario.input.context,
        stderrLogs: stderrLogs.length > 0 ? stderrLogs : undefined,
      };

      this.log(`Scenario ${scenario.name}: ${allPassed ? 'PASSED' : 'FAILED'}`);
      this.options.onTestComplete(result);

      return result;
    } catch (error) {
      const completedAt = new Date().toISOString();
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.log(`Scenario ${scenario.name}: ERROR - ${errorMessage}`);

      // Zbierz partial messages (jeśli agent istnieje)
      const partialMessages = agent?.getCollectedMessages() || [];

      // Zbierz partial tool calls z OBU źródeł (jak w happy path)
      const mcpToolCalls = tracker?.getCalls() || [];
      const sdkToolCalls = extractToolCallsFromMessages(partialMessages);
      const mcpToolNames = new Set(mcpToolCalls.map(c => c.toolName));
      const uniqueSdkCalls = sdkToolCalls.filter(c => !mcpToolNames.has(c.toolName));
      const partialToolCalls = [...mcpToolCalls, ...uniqueSdkCalls];

      // Zbierz partial stderr logs (jeśli agent istnieje)
      const partialStderrLogs = agent?.getCollectedStderrLogs() || [];

      // Pobierz partial prompt info (jeśli agent istnieje)
      const partialPromptInfo = agent?.getResolvedPromptInfo();

      // System prompt jako pierwsza wiadomość
      const systemMessageEntry: RawMessage = {
        role: 'system',
        timestamp: new Date(startedAt).getTime(),
        content: [{ type: 'text', text: partialPromptInfo?.resolvedPrompt || '' }],
      };

      // Wiadomość użytkownika jako druga
      const userMessageEntry: RawMessage = {
        role: 'user',
        timestamp: new Date(startedAt).getTime(),
        content: [{ type: 'text', text: scenario.input.userMessage }],
      };

      // Partial data diff (jeśli storage istnieje i mamy beforeSnapshot)
      let partialDataDiff = {
        blocks: { added: [] as unknown[], modified: [] as unknown[], deleted: [] as unknown[] },
        timelines: { added: [] as unknown[], modified: [] as unknown[], deleted: [] as unknown[] },
        mediaAssets: { added: [] as unknown[], modified: [] as unknown[], deleted: [] as unknown[] },
      };

      if (this.storage && beforeSnapshot) {
        try {
          const afterSnapshot = this.storage.getSnapshot();
          partialDataDiff = this.storage.diff(beforeSnapshot, afterSnapshot);
        } catch {
          // Jeśli diff się nie udał, zostaw puste arrays
        }
      }

      // Zbierz partial metrics (jeśli agent istnieje i ma metodę getPartialMetrics)
      const partialMetrics = agent?.getPartialMetrics?.();

      const result: TestResult = {
        id: testId,
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: false,
        toolCalls: partialToolCalls,
        dataDiff: partialDataDiff,
        assertions: [{ name: 'Execution', passed: false, message: errorMessage }],
        metrics: {
          inputTokens: partialMetrics?.inputTokens || 0,
          outputTokens: partialMetrics?.outputTokens || 0,
          totalTokens: (partialMetrics?.inputTokens || 0) + (partialMetrics?.outputTokens || 0),
          latencyMs: new Date(completedAt).getTime() - new Date(startedAt).getTime(),
          turnCount: partialMetrics?.turnCount || partialToolCalls.length,
        },
        error: errorMessage,
        startedAt,
        completedAt,
        messages: [systemMessageEntry, userMessageEntry, ...partialMessages],
        systemPromptInfo: partialPromptInfo
          ? {
              source: partialPromptInfo.source,
              sourceFile: partialPromptInfo.sourceFile,
              patches: partialPromptInfo.patches,
              content: partialPromptInfo.rawPrompt,
              resolvedContent: partialPromptInfo.resolvedPrompt,
            }
          : undefined,
        userMessage: scenario.input.userMessage,
        inputContext: scenario.input.context,
        stderrLogs: partialStderrLogs.length > 0 ? partialStderrLogs : undefined,
      };

      this.options.onTestComplete(result);
      return result;
    } finally {
      // 10. Przywróć domyślne storage (SQLite) i vector store
      storageRegistry.resetToDefaults();
      semanticSearchService.resetVectorStore();
      this.storage = null;
    }
  }

  /**
   * Uruchamia wiele scenariuszy
   *
   * Jeśli `saveResults` jest włączone, zapisuje wyniki do bazy SQLite.
   *
   * @returns Wyniki testów oraz opcjonalnie ID suite run
   */
  async runScenarios(scenarios: TestScenario[]): Promise<{
    results: TestResult[];
    suiteRunId?: string;
  }> {
    const results: TestResult[] = [];

    // Rozpocznij suite run jeśli zapisujemy wyniki
    if (this.options.saveResults) {
      const configSnapshot = this.options.configSnapshot || this.createDefaultConfigSnapshot(scenarios);
      this.currentSuiteRunId = evalStorageService.startSuiteRun(
        configSnapshot,
        this.options.tags,
        this.options.label
      );
      this.log(`Started suite run: ${this.currentSuiteRunId}`);
    }

    for (const scenario of scenarios) {
      const result = await this.runScenario(scenario);
      results.push(result);

      // Zapisz wynik scenariusza do bazy
      if (this.options.saveResults && this.currentSuiteRunId) {
        const fixtures = this.storage?.getSnapshot() || {};
        evalStorageService.saveScenarioResult(
          this.currentSuiteRunId,
          scenario,
          {
            passed: result.passed,
            toolCalls: result.toolCalls,
            dataDiff: result.dataDiff,
            assertions: result.assertions,
            agentResponse: result.agentResponse,
            error: result.error,
            metrics: result.metrics,
            startedAt: result.startedAt,
            completedAt: result.completedAt,
          },
          fixtures as Record<string, unknown>
        );
      }
    }

    const suiteRunId = this.currentSuiteRunId || undefined;
    this.currentSuiteRunId = null;

    return { results, suiteRunId };
  }

  /**
   * Tworzy domyślny config snapshot na podstawie scenariuszy
   */
  private createDefaultConfigSnapshot(scenarios: TestScenario[]): Record<string, unknown> {
    const agentTypes = [...new Set(scenarios.map(s => s.agent))];

    // Zbierz informacje o custom promptach
    const promptSources = scenarios.map(s => ({
      scenarioId: s.id,
      agent: s.agent,
      promptSource: s.systemPrompt?.raw
        ? 'custom-raw'
        : s.systemPrompt?.file
          ? `custom-file:${s.systemPrompt.file}`
          : s.systemPrompt?.patches
            ? 'patched'
            : 'default',
    }));

    // Zbierz konfigurację narzędzi
    const toolsConfig: Record<string, unknown> = {};
    if (this.options.enabledTools) {
      toolsConfig.enabledTools = this.options.enabledTools;
    }
    if (this.options.disabledTools) {
      toolsConfig.disabledTools = this.options.disabledTools;
    }
    if (this.options.toolDescriptions && Object.keys(this.options.toolDescriptions).length > 0) {
      toolsConfig.toolDescriptions = this.options.toolDescriptions;
    }
    if (this.options.toolParameterDescriptions && Object.keys(this.options.toolParameterDescriptions).length > 0) {
      toolsConfig.toolParameterDescriptions = this.options.toolParameterDescriptions;
    }

    return {
      createdAt: new Date().toISOString(),
      agentTypes,
      scenarioCount: scenarios.length,
      fixturesPath: this.options.fixturesPath,
      promptSources,
      model: this.options.model,
      thinkingMode: this.options.thinkingMode,
      ...(Object.keys(toolsConfig).length > 0 && { toolsConfig }),
    };
  }

  /**
   * Uruchamia scenariusz z różnymi wariantami polecenia
   */
  async runScenarioWithVariants(
    scenario: TestScenario,
    messageVariants: string[]
  ): Promise<{ variant: string; result: TestResult }[]> {
    const results: { variant: string; result: TestResult }[] = [];

    for (const variant of messageVariants) {
      const variantScenario = {
        ...scenario,
        id: `${scenario.id}-variant-${results.length + 1}`,
        name: `${scenario.name} (variant: "${variant.substring(0, 30)}...")`,
        input: {
          ...scenario.input,
          userMessage: variant,
        },
      };

      const result = await this.runScenario(variantScenario);
      results.push({ variant, result });
    }

    return results;
  }

  /**
   * Zwraca bieżący storage (dla debugowania)
   */
  getCurrentStorage(): JsonStorage | null {
    return this.storage;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    agent?: TestableAgentAdapter
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (agent) {
          agent.cancel();
          this.log('Agent cancelled due to timeout');
        }
        reject(new Error(`Test timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private log(message: string): void {
    if (this.options.verbose) {
      console.log(`[TestHarness] ${message}`);
    }
  }
}

// ============================================================================
// SUMMARY HELPERS
// ============================================================================

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  passRate: number;
  totalTokens: number;
  totalLatencyMs: number;
  avgTokensPerTest: number;
  avgLatencyMs: number;
  failedScenarios: string[];
}

export function summarizeResults(results: TestResult[]): TestSummary {
  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;

  const totalTokens = results.reduce((sum, r) => sum + r.metrics.totalTokens, 0);
  const totalLatencyMs = results.reduce((sum, r) => sum + r.metrics.latencyMs, 0);

  return {
    total: results.length,
    passed,
    failed,
    passRate: results.length > 0 ? passed / results.length : 0,
    totalTokens,
    totalLatencyMs,
    avgTokensPerTest: results.length > 0 ? totalTokens / results.length : 0,
    avgLatencyMs: results.length > 0 ? totalLatencyMs / results.length : 0,
    failedScenarios: results.filter((r) => !r.passed).map((r) => r.scenarioId),
  };
}

export function formatSummary(summary: TestSummary): string {
  const lines = [
    `\n${'='.repeat(60)}`,
    `TEST SUMMARY`,
    `${'='.repeat(60)}`,
    `Total:    ${summary.total}`,
    `Passed:   ${summary.passed} (${(summary.passRate * 100).toFixed(1)}%)`,
    `Failed:   ${summary.failed}`,
    ``,
    `Tokens:   ${summary.totalTokens} total (avg: ${summary.avgTokensPerTest.toFixed(0)}/test)`,
    `Latency:  ${(summary.totalLatencyMs / 1000).toFixed(1)}s total (avg: ${(summary.avgLatencyMs / 1000).toFixed(1)}s/test)`,
  ];

  if (summary.failedScenarios.length > 0) {
    lines.push(``, `Failed scenarios:`, ...summary.failedScenarios.map((s) => `  - ${s}`));
  }

  lines.push(`${'='.repeat(60)}\n`);

  return lines.join('\n');
}
