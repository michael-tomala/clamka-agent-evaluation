/**
 * Results Store - przechowywanie wyników testów
 *
 * Używa SQLite jako jedynego źródła danych (bez plików JSON).
 * Schemat: suite_runs, scenario_results, tool_calls, messages
 */

import Database from 'better-sqlite3';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { TestResult, TestScenario } from '../../agent-evals/types/scenario';
import { summarizeResults, type TestSummary } from '../../agent-evals/harness/test-harness';

// ============================================================================
// TYPES
// ============================================================================

export interface ConfigSnapshot {
  model?: string;
  thinkingMode?: string;
  enabledTools?: string[];
  disabledTools?: string[];
  systemPromptSource?: string;
  systemPromptMode?: 'append' | 'replace';
  systemPromptRaw?: string;
  toolDescriptions?: Record<string, string>;
  toolParameterDescriptions?: Record<string, Record<string, string>>;
  transAgentPrompts?: Record<string, { raw?: string; mode?: 'append' | 'replace' }>;
}

export type SuiteStatus = 'pending' | 'running' | 'completed' | 'failed' | 'stopped';

export interface SuiteRun {
  id: string;
  createdAt: string;
  tags: string[];
  label?: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  totalTokens: number;
  totalLatencyMs: number;
  configSnapshot?: ConfigSnapshot;
  scenarioIds?: string[];
  scenarioNames?: Record<string, string>;
  /** Status suite'a - running/completed/failed */
  status?: SuiteStatus;
  /** ID joba w kolejce (jobId) */
  jobId?: string;
  /** Aktualnie wykonywany scenariusz (tylko dla running) */
  currentScenario?: string;
  /** Postęp wykonania */
  progress?: {
    completed: number;
    total: number;
  };
  /** Lista scenariuszy z ich statusami */
  scenarioStatuses?: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'>;
}

export interface SuiteRunWithResults extends SuiteRun {
  results: TestResult[];
  summary: TestSummary;
}

export interface ScenarioResultEntry {
  id: string;
  suiteRunId: string;
  scenarioId: string;
  scenarioName?: string;
  passed: boolean;
  tokens: number;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  turnCount?: number;
  startedAt?: string;
  completedAt?: string;
  agentResponse?: string;
  error?: string;
}

// ============================================================================
// RESULTS STORE
// ============================================================================

export class ResultsStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const baseDir = path.join(__dirname, '../../agent-evals/results');
    const dbFilePath = dbPath || path.join(baseDir, 'evals.db');
    this.db = new Database(dbFilePath);

    this.initSchema();
  }

  private initSchema(): void {
    // 1. Utwórz tabele (BEZ nowych kolumn status/job_id dla kompatybilności z istniejącymi bazami)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS suite_runs (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,
        tags TEXT,
        label TEXT,
        json_path TEXT NOT NULL,
        total_scenarios INTEGER,
        passed_scenarios INTEGER,
        failed_scenarios INTEGER,
        total_tokens INTEGER,
        total_latency_ms INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_suite_date ON suite_runs(created_at);
      CREATE INDEX IF NOT EXISTS idx_suite_tags ON suite_runs(tags);

      CREATE TABLE IF NOT EXISTS scenario_results (
        id TEXT PRIMARY KEY,
        suite_run_id TEXT NOT NULL,
        scenario_id TEXT NOT NULL,
        passed BOOLEAN NOT NULL,
        tokens INTEGER,
        latency_ms INTEGER,
        json_path TEXT NOT NULL,
        FOREIGN KEY (suite_run_id) REFERENCES suite_runs(id)
      );

      CREATE INDEX IF NOT EXISTS idx_scenario_suite ON scenario_results(suite_run_id);
      CREATE INDEX IF NOT EXISTS idx_scenario_id ON scenario_results(scenario_id);
      CREATE INDEX IF NOT EXISTS idx_scenario_passed ON scenario_results(passed);
    `);

    // 2. Migracja - dodaj nowe kolumny i indeksy
    this.migrateSchema();
  }

  private migrateSchema(): void {
    // Sprawdź czy kolumny istnieją i dodaj jeśli nie
    const suiteColumns = this.db.prepare("PRAGMA table_info(suite_runs)").all() as Array<{ name: string }>;
    const suiteColumnNames = new Set(suiteColumns.map(c => c.name));

    // Migracja suite_runs
    if (!suiteColumnNames.has('status')) {
      this.db.exec("ALTER TABLE suite_runs ADD COLUMN status TEXT DEFAULT 'completed'");
    }
    if (!suiteColumnNames.has('job_id')) {
      this.db.exec("ALTER TABLE suite_runs ADD COLUMN job_id TEXT");
    }
    if (!suiteColumnNames.has('config_snapshot')) {
      this.db.exec("ALTER TABLE suite_runs ADD COLUMN config_snapshot TEXT"); // JSON
    }
    if (!suiteColumnNames.has('scenario_ids')) {
      this.db.exec("ALTER TABLE suite_runs ADD COLUMN scenario_ids TEXT"); // JSON array
    }
    if (!suiteColumnNames.has('scenario_names')) {
      this.db.exec("ALTER TABLE suite_runs ADD COLUMN scenario_names TEXT"); // JSON object
    }

    // Migracja scenario_results - nowe kolumny
    const scenarioColumns = this.db.prepare("PRAGMA table_info(scenario_results)").all() as Array<{ name: string }>;
    const scenarioColumnNames = new Set(scenarioColumns.map(c => c.name));

    if (!scenarioColumnNames.has('scenario_name')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN scenario_name TEXT");
    }
    if (!scenarioColumnNames.has('input_tokens')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN input_tokens INTEGER");
    }
    if (!scenarioColumnNames.has('output_tokens')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN output_tokens INTEGER");
    }
    if (!scenarioColumnNames.has('turn_count')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN turn_count INTEGER");
    }
    if (!scenarioColumnNames.has('started_at')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN started_at TEXT");
    }
    if (!scenarioColumnNames.has('completed_at')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN completed_at TEXT");
    }
    if (!scenarioColumnNames.has('agent_response')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN agent_response TEXT");
    }
    if (!scenarioColumnNames.has('error')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN error TEXT");
    }
    if (!scenarioColumnNames.has('user_message')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN user_message TEXT");
    }
    if (!scenarioColumnNames.has('data_diff')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN data_diff TEXT"); // JSON
    }
    if (!scenarioColumnNames.has('assertions')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN assertions TEXT"); // JSON array
    }
    if (!scenarioColumnNames.has('system_prompt_info')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN system_prompt_info TEXT"); // JSON
    }
    if (!scenarioColumnNames.has('status')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN status TEXT DEFAULT 'pending'");
    }
    if (!scenarioColumnNames.has('input_context')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN input_context TEXT"); // JSON
    }
    if (!scenarioColumnNames.has('stderr_logs')) {
      this.db.exec("ALTER TABLE scenario_results ADD COLUMN stderr_logs TEXT"); // JSON array
    }

    // Nowe tabele: tool_calls i messages
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tool_calls (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_result_id TEXT NOT NULL,
        tool_order INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        input TEXT,
        output TEXT,
        timestamp INTEGER,
        duration_ms INTEGER,
        FOREIGN KEY (scenario_result_id) REFERENCES scenario_results(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_tool_scenario ON tool_calls(scenario_result_id);
      CREATE INDEX IF NOT EXISTS idx_tool_name ON tool_calls(tool_name);

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_result_id TEXT NOT NULL,
        message_order INTEGER NOT NULL,
        role TEXT NOT NULL,
        timestamp INTEGER,
        content TEXT NOT NULL,
        FOREIGN KEY (scenario_result_id) REFERENCES scenario_results(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_message_scenario ON messages(scenario_result_id);
    `);

    // Utwórz indeksy na nowych kolumnach (dopiero PO migracji)
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_suite_status ON suite_runs(status);
      CREATE INDEX IF NOT EXISTS idx_suite_job_id ON suite_runs(job_id);
    `);

    // Migracja messages - dodaj parent_tool_use_id
    const messageColumns = this.db.prepare("PRAGMA table_info(messages)").all() as Array<{ name: string }>;
    const messageColumnNames = new Set(messageColumns.map(c => c.name));

    if (!messageColumnNames.has('parent_tool_use_id')) {
      this.db.exec("ALTER TABLE messages ADD COLUMN parent_tool_use_id TEXT");
      this.db.exec("CREATE INDEX IF NOT EXISTS idx_message_parent ON messages(parent_tool_use_id)");
    }
  }

  // In-memory store dla live status (scenarioStatuses, currentScenario)
  private liveStatus = new Map<string, {
    currentScenario?: string;
    scenarioStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'>;
  }>();

  /**
   * Tworzy nowy suite run PRZED uruchomieniem testów (status: running)
   */
  createSuiteRun(options: {
    jobId: string;
    scenarioIds: string[];
    scenarioNames?: Record<string, string>;
    tags?: string[];
    label?: string;
    configSnapshot?: ConfigSnapshot;
  }): SuiteRun {
    const suiteId = uuidv4();
    const createdAt = new Date().toISOString();

    // Zapisz do SQLite
    const stmt = this.db.prepare(`
      INSERT INTO suite_runs (id, created_at, tags, label, json_path, total_scenarios, passed_scenarios, failed_scenarios, total_tokens, total_latency_ms, status, job_id, config_snapshot, scenario_ids, scenario_names)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      suiteId,
      createdAt,
      JSON.stringify(options.tags || []),
      options.label || null,
      options.scenarioIds.length,
      0,
      0,
      0,
      0,
      'running',
      options.jobId,
      options.configSnapshot ? JSON.stringify(options.configSnapshot) : null,
      JSON.stringify(options.scenarioIds),
      options.scenarioNames ? JSON.stringify(options.scenarioNames) : null
    );

    // Utwórz rekordy scenario_results dla wszystkich scenariuszy ze statusem 'pending'
    const insertScenario = this.db.prepare(`
      INSERT INTO scenario_results (id, suite_run_id, scenario_id, scenario_name, passed, tokens, latency_ms, json_path, status)
      VALUES (?, ?, ?, ?, 0, 0, 0, '', 'pending')
    `);

    const scenarioStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'> = {};
    for (const scenarioId of options.scenarioIds) {
      const resultId = `${suiteId}_${scenarioId}`;
      const scenarioName = options.scenarioNames?.[scenarioId] || scenarioId;
      insertScenario.run(resultId, suiteId, scenarioId, scenarioName);
      scenarioStatuses[scenarioId] = 'pending';
    }

    // Inicjalizuj live status (nadal potrzebne dla currentScenario)
    this.liveStatus.set(suiteId, { scenarioStatuses });

    return {
      id: suiteId,
      createdAt,
      tags: options.tags || [],
      label: options.label,
      totalScenarios: options.scenarioIds.length,
      passedScenarios: 0,
      failedScenarios: 0,
      totalTokens: 0,
      totalLatencyMs: 0,
      configSnapshot: options.configSnapshot,
      scenarioIds: options.scenarioIds,
      scenarioNames: options.scenarioNames,
      status: 'running',
      jobId: options.jobId,
      progress: { completed: 0, total: options.scenarioIds.length },
      scenarioStatuses,
    };
  }

  /**
   * Aktualizuje status scenariusza w bazie danych
   */
  updateScenarioStatus(suiteId: string, scenarioId: string, status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'): void {
    this.db.prepare(`
      UPDATE scenario_results
      SET status = ?
      WHERE suite_run_id = ? AND scenario_id = ?
    `).run(status, suiteId, scenarioId);
  }

  /**
   * Zapisuje pełne wyniki scenariusza do bazy (wywoływane w onTestComplete)
   */
  saveScenarioResult(suiteId: string, result: TestResult): void {
    const scenarioResultId = `${suiteId}_${result.scenarioId}`;
    const resultStatus = result.passed ? 'completed' : 'failed';

    // Aktualizuj scenario_results
    this.db.prepare(`
      UPDATE scenario_results
      SET passed = ?, tokens = ?, latency_ms = ?,
          scenario_name = COALESCE(?, scenario_name),
          input_tokens = ?, output_tokens = ?, turn_count = ?,
          started_at = ?, completed_at = ?, agent_response = ?, error = ?,
          data_diff = ?, assertions = ?, system_prompt_info = ?,
          status = ?, input_context = ?, stderr_logs = ?
      WHERE suite_run_id = ? AND scenario_id = ?
    `).run(
      result.passed ? 1 : 0,
      result.metrics.totalTokens,
      result.metrics.latencyMs,
      result.scenarioName || null,
      result.metrics.inputTokens || null,
      result.metrics.outputTokens || null,
      result.metrics.turnCount || null,
      result.startedAt || null,
      result.completedAt || null,
      result.agentResponse || null,
      result.error || null,
      result.dataDiff ? JSON.stringify(result.dataDiff) : null,
      result.assertions ? JSON.stringify(result.assertions) : null,
      result.systemPromptInfo ? JSON.stringify(result.systemPromptInfo) : null,
      resultStatus,
      result.inputContext ? JSON.stringify(result.inputContext) : null,
      result.stderrLogs ? JSON.stringify(result.stderrLogs) : null,
      suiteId,
      result.scenarioId
    );

    // Zapisz tool_calls
    if (result.toolCalls && result.toolCalls.length > 0) {
      const insertToolCall = this.db.prepare(`
        INSERT INTO tool_calls (scenario_result_id, tool_order, tool_name, input, output, timestamp, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const tc of result.toolCalls) {
        insertToolCall.run(
          scenarioResultId,
          tc.order ?? 0,
          tc.toolName,
          tc.input ? JSON.stringify(tc.input) : null,
          tc.output ? JSON.stringify(tc.output) : null,
          tc.timestamp || null,
          tc.durationMs || null
        );
      }
    }

    // Zapisz messages
    if (result.messages && result.messages.length > 0) {
      const insertMessage = this.db.prepare(`
        INSERT INTO messages (scenario_result_id, message_order, role, timestamp, content, parent_tool_use_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      let msgOrder = 0;
      for (const msg of result.messages) {
        insertMessage.run(
          scenarioResultId,
          msgOrder++,
          msg.role,
          msg.timestamp || null,
          JSON.stringify(msg.content),
          msg.parentToolUseId || null
        );
      }
    }
  }

  /**
   * Aktualizuje live status suite'a (scenarioStatuses, currentScenario)
   */
  updateLiveStatus(suiteId: string, update: {
    currentScenario?: string | null;
    scenarioStatus?: { scenarioId: string; status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' };
  }): void {
    const live = this.liveStatus.get(suiteId);
    if (!live) return;

    if (update.currentScenario !== undefined) {
      live.currentScenario = update.currentScenario || undefined;
    }
    if (update.scenarioStatus) {
      live.scenarioStatuses[update.scenarioStatus.scenarioId] = update.scenarioStatus.status;
      // Aktualizuj status w bazie danych
      this.updateScenarioStatus(suiteId, update.scenarioStatus.scenarioId, update.scenarioStatus.status);
    }
  }

  /**
   * Pobiera live status suite'a
   */
  getLiveStatus(suiteId: string): { currentScenario?: string; scenarioStatuses: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'> } | null {
    return this.liveStatus.get(suiteId) || null;
  }

  /**
   * Pobiera statusy scenariuszy z bazy danych
   */
  getScenarioStatuses(suiteId: string): Array<{
    id: string;
    name: string;
    status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
    passed: boolean;
    tokens?: number;
    latencyMs?: number;
    turnCount?: number;
    error?: string;
  }> {
    const rows = this.db.prepare(`
      SELECT scenario_id, scenario_name, status, passed, tokens, latency_ms, turn_count, error
      FROM scenario_results
      WHERE suite_run_id = ?
    `).all(suiteId) as Array<{
      scenario_id: string;
      scenario_name: string | null;
      status: string | null;
      passed: number;
      tokens: number | null;
      latency_ms: number | null;
      turn_count: number | null;
      error: string | null;
    }>;

    return rows.map(row => ({
      id: row.scenario_id,
      name: row.scenario_name || row.scenario_id,
      status: (row.status || 'pending') as 'pending' | 'running' | 'completed' | 'failed' | 'cancelled',
      passed: row.passed === 1,
      tokens: row.tokens || undefined,
      latencyMs: row.latency_ms || undefined,
      turnCount: row.turn_count || undefined,
      error: row.error || undefined,
    }));
  }

  /**
   * Finalizuje suite run po zakończeniu testów
   * (wyniki scenariuszy są już zapisane przez saveScenarioResult w onTestComplete)
   */
  finalizeSuiteRun(suiteId: string, results: TestResult[], status: 'completed' | 'failed' | 'stopped' = 'completed'): void {
    const exists = this.db.prepare('SELECT id FROM suite_runs WHERE id = ?').get(suiteId);
    if (!exists) return;

    const summary = summarizeResults(results);

    // Jeśli suite zostało zatrzymane, oznacz niewykonane scenariusze jako 'cancelled'
    if (status === 'stopped') {
      this.db.prepare(`
        UPDATE scenario_results
        SET status = 'cancelled'
        WHERE suite_run_id = ? AND status = 'pending'
      `).run(suiteId);
    }

    // Aktualizuj suite_runs w SQLite (podsumowanie)
    this.db.prepare(`
      UPDATE suite_runs
      SET total_scenarios = ?, passed_scenarios = ?, failed_scenarios = ?, total_tokens = ?, total_latency_ms = ?, status = ?
      WHERE id = ?
    `).run(
      summary.total,
      summary.passed,
      summary.failed,
      summary.totalTokens,
      summary.totalLatencyMs,
      status,
      suiteId
    );

    // Wyczyść live status
    this.liveStatus.delete(suiteId);
  }

  /**
   * Pobiera suiteId po jobId
   */
  getSuiteIdByJobId(jobId: string): string | null {
    const row = this.db.prepare('SELECT id FROM suite_runs WHERE job_id = ?').get(jobId) as { id: string } | undefined;
    return row?.id || null;
  }

  /**
   * Zapisuje wyniki suite'a (synchronicznie, bez kolejki)
   */
  saveSuiteRun(results: TestResult[], options?: { tags?: string[]; label?: string; configSnapshot?: ConfigSnapshot }): SuiteRun {
    const suiteId = uuidv4();
    const createdAt = new Date().toISOString();
    const summary = summarizeResults(results);
    const scenarioIds = results.map(r => r.scenarioId);

    // Zapisz suite do SQLite
    const stmt = this.db.prepare(`
      INSERT INTO suite_runs (id, created_at, tags, label, json_path, total_scenarios, passed_scenarios, failed_scenarios, total_tokens, total_latency_ms, status, config_snapshot, scenario_ids)
      VALUES (?, ?, ?, ?, '', ?, ?, ?, ?, ?, 'completed', ?, ?)
    `);
    stmt.run(
      suiteId,
      createdAt,
      JSON.stringify(options?.tags || []),
      options?.label || null,
      summary.total,
      summary.passed,
      summary.failed,
      summary.totalTokens,
      summary.totalLatencyMs,
      options?.configSnapshot ? JSON.stringify(options.configSnapshot) : null,
      JSON.stringify(scenarioIds)
    );

    // Zapisz poszczególne scenariusze do SQLite
    const scenarioStmt = this.db.prepare(`
      INSERT INTO scenario_results
      (id, suite_run_id, scenario_id, passed, tokens, latency_ms, json_path,
       scenario_name, input_tokens, output_tokens, turn_count,
       started_at, completed_at, agent_response, error,
       data_diff, assertions, system_prompt_info, input_context, stderr_logs)
      VALUES (?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertToolCall = this.db.prepare(`
      INSERT INTO tool_calls (scenario_result_id, tool_order, tool_name, input, output, timestamp, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMessage = this.db.prepare(`
      INSERT INTO messages (scenario_result_id, message_order, role, timestamp, content, parent_tool_use_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const result of results) {
      const scenarioResultId = result.id || uuidv4();

      scenarioStmt.run(
        scenarioResultId,
        suiteId,
        result.scenarioId,
        result.passed ? 1 : 0,
        result.metrics.totalTokens,
        result.metrics.latencyMs,
        result.scenarioName || null,
        result.metrics.inputTokens || null,
        result.metrics.outputTokens || null,
        result.metrics.turnCount || null,
        result.startedAt || null,
        result.completedAt || null,
        result.agentResponse || null,
        result.error || null,
        result.dataDiff ? JSON.stringify(result.dataDiff) : null,
        result.assertions ? JSON.stringify(result.assertions) : null,
        result.systemPromptInfo ? JSON.stringify(result.systemPromptInfo) : null,
        result.inputContext ? JSON.stringify(result.inputContext) : null,
        result.stderrLogs ? JSON.stringify(result.stderrLogs) : null
      );

      // Zapisz tool_calls
      if (result.toolCalls && result.toolCalls.length > 0) {
        for (const tc of result.toolCalls) {
          insertToolCall.run(
            scenarioResultId,
            tc.order ?? 0,
            tc.toolName,
            tc.input ? JSON.stringify(tc.input) : null,
            tc.output ? JSON.stringify(tc.output) : null,
            tc.timestamp || null,
            tc.durationMs || null
          );
        }
      }

      // Zapisz messages
      if (result.messages && result.messages.length > 0) {
        let msgOrder = 0;
        for (const msg of result.messages) {
          insertMessage.run(
            scenarioResultId,
            msgOrder++,
            msg.role,
            msg.timestamp || null,
            JSON.stringify(msg.content),
            msg.parentToolUseId || null
          );
        }
      }
    }

    return {
      id: suiteId,
      createdAt,
      tags: options?.tags || [],
      label: options?.label,
      totalScenarios: summary.total,
      passedScenarios: summary.passed,
      failedScenarios: summary.failed,
      totalTokens: summary.totalTokens,
      totalLatencyMs: summary.totalLatencyMs,
      configSnapshot: options?.configSnapshot,
      scenarioIds,
      status: 'completed',
    };
  }

  /**
   * Pobiera listę suite run'ów
   */
  listSuiteRuns(options?: { limit?: number; offset?: number; tags?: string[] }): SuiteRun[] {
    let query = 'SELECT * FROM suite_runs';
    const params: unknown[] = [];

    if (options?.tags && options.tags.length > 0) {
      const tagConditions = options.tags.map(() => 'tags LIKE ?').join(' OR ');
      query += ` WHERE (${tagConditions})`;
      params.push(...options.tags.map((t) => `%"${t}"%`));
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: string;
      created_at: string;
      tags: string;
      label: string | null;
      total_scenarios: number;
      passed_scenarios: number;
      failed_scenarios: number;
      total_tokens: number;
      total_latency_ms: number;
      status: string | null;
      job_id: string | null;
      config_snapshot: string | null;
      scenario_ids: string | null;
      scenario_names: string | null;
    }>;

    return rows.map((row) => {
      const liveStatus = this.liveStatus.get(row.id);
      const completedCount = liveStatus
        ? Object.values(liveStatus.scenarioStatuses).filter(s => s === 'completed' || s === 'failed').length
        : row.total_scenarios;

      return {
        id: row.id,
        createdAt: row.created_at,
        tags: JSON.parse(row.tags || '[]'),
        label: row.label || undefined,
        totalScenarios: row.total_scenarios,
        passedScenarios: row.passed_scenarios,
        failedScenarios: row.failed_scenarios,
        totalTokens: row.total_tokens,
        totalLatencyMs: row.total_latency_ms,
        configSnapshot: row.config_snapshot ? JSON.parse(row.config_snapshot) : undefined,
        scenarioIds: row.scenario_ids ? JSON.parse(row.scenario_ids) : undefined,
        scenarioNames: row.scenario_names ? JSON.parse(row.scenario_names) : undefined,
        status: (row.status || 'completed') as SuiteStatus,
        jobId: row.job_id || undefined,
        currentScenario: liveStatus?.currentScenario,
        progress: { completed: completedCount, total: row.total_scenarios },
      };
    });
  }

  /**
   * Pobiera suite run z wynikami
   */
  getSuiteRun(suiteId: string): SuiteRunWithResults | null {
    const row = this.db.prepare('SELECT * FROM suite_runs WHERE id = ?').get(suiteId) as {
      id: string;
      created_at: string;
      tags: string;
      label: string | null;
      total_scenarios: number;
      passed_scenarios: number;
      failed_scenarios: number;
      total_tokens: number;
      total_latency_ms: number;
      status: string | null;
      job_id: string | null;
      config_snapshot: string | null;
      scenario_ids: string | null;
      scenario_names: string | null;
    } | undefined;

    if (!row) return null;

    // Pobierz wyniki scenariuszy z SQLite
    const scenarioRows = this.db.prepare(`
      SELECT * FROM scenario_results WHERE suite_run_id = ?
    `).all(suiteId) as Array<{
      id: string;
      scenario_id: string;
      scenario_name: string | null;
      passed: number;
      tokens: number;
      latency_ms: number;
      input_tokens: number | null;
      output_tokens: number | null;
      turn_count: number | null;
      started_at: string | null;
      completed_at: string | null;
      agent_response: string | null;
      error: string | null;
      data_diff: string | null;
      assertions: string | null;
      system_prompt_info: string | null;
      input_context: string | null;
      stderr_logs: string | null;
    }>;

    // Pobierz tool_calls i messages dla każdego scenariusza
    const getToolCalls = this.db.prepare(`
      SELECT * FROM tool_calls WHERE scenario_result_id = ? ORDER BY tool_order
    `);
    const getMessages = this.db.prepare(`
      SELECT * FROM messages WHERE scenario_result_id = ? ORDER BY message_order
    `);

    const results: TestResult[] = scenarioRows.map(sr => {
      const toolCallRows = getToolCalls.all(sr.id) as Array<{
        tool_order: number;
        tool_name: string;
        input: string | null;
        output: string | null;
        timestamp: number | null;
        duration_ms: number | null;
      }>;

      const messageRows = getMessages.all(sr.id) as Array<{
        message_order: number;
        role: string;
        timestamp: number | null;
        content: string;
        parent_tool_use_id: string | null;
      }>;

      return {
        id: sr.id,
        scenarioId: sr.scenario_id,
        scenarioName: sr.scenario_name || undefined,
        passed: sr.passed === 1,
        toolCalls: toolCallRows.map(tc => ({
          order: tc.tool_order,
          toolName: tc.tool_name,
          input: tc.input ? JSON.parse(tc.input) : undefined,
          output: tc.output ? JSON.parse(tc.output) : undefined,
          timestamp: tc.timestamp || undefined,
          durationMs: tc.duration_ms || undefined,
        })),
        messages: messageRows.map(m => ({
          role: m.role as 'user' | 'assistant',
          timestamp: m.timestamp || undefined,
          content: JSON.parse(m.content),
          parentToolUseId: m.parent_tool_use_id || undefined,
        })),
        dataDiff: sr.data_diff ? JSON.parse(sr.data_diff) : undefined,
        assertions: sr.assertions ? JSON.parse(sr.assertions) : undefined,
        metrics: {
          inputTokens: sr.input_tokens || 0,
          outputTokens: sr.output_tokens || 0,
          totalTokens: sr.tokens,
          latencyMs: sr.latency_ms,
          turnCount: sr.turn_count || 0,
        },
        agentResponse: sr.agent_response || undefined,
        error: sr.error || undefined,
        startedAt: sr.started_at || undefined,
        completedAt: sr.completed_at || undefined,
        systemPromptInfo: sr.system_prompt_info ? JSON.parse(sr.system_prompt_info) : undefined,
        inputContext: sr.input_context ? JSON.parse(sr.input_context) : undefined,
        stderrLogs: sr.stderr_logs ? JSON.parse(sr.stderr_logs) : undefined,
      };
    });

    // Pobierz live status jeśli suite jest running
    const liveStatus = this.liveStatus.get(suiteId);
    const status = (row.status || 'completed') as SuiteStatus;

    // Oblicz progress
    const completedCount = liveStatus
      ? Object.values(liveStatus.scenarioStatuses).filter(s => s === 'completed' || s === 'failed').length
      : row.total_scenarios;

    // Generuj summary
    const summary = summarizeResults(results);

    return {
      id: row.id,
      createdAt: row.created_at,
      tags: JSON.parse(row.tags || '[]'),
      label: row.label || undefined,
      totalScenarios: row.total_scenarios,
      passedScenarios: row.passed_scenarios,
      failedScenarios: row.failed_scenarios,
      totalTokens: row.total_tokens,
      totalLatencyMs: row.total_latency_ms,
      configSnapshot: row.config_snapshot ? JSON.parse(row.config_snapshot) : undefined,
      scenarioIds: row.scenario_ids ? JSON.parse(row.scenario_ids) : undefined,
      scenarioNames: row.scenario_names ? JSON.parse(row.scenario_names) : undefined,
      results,
      summary,
      status,
      jobId: row.job_id || undefined,
      currentScenario: liveStatus?.currentScenario,
      progress: { completed: completedCount, total: row.total_scenarios },
      scenarioStatuses: liveStatus?.scenarioStatuses,
    };
  }

  /**
   * Pobiera wynik scenariusza
   */
  getScenarioResult(suiteId: string, scenarioId: string): TestResult | null {
    const sr = this.db.prepare(`
      SELECT * FROM scenario_results WHERE suite_run_id = ? AND scenario_id = ?
    `).get(suiteId, scenarioId) as {
      id: string;
      scenario_id: string;
      scenario_name: string | null;
      passed: number;
      tokens: number;
      latency_ms: number;
      input_tokens: number | null;
      output_tokens: number | null;
      turn_count: number | null;
      started_at: string | null;
      completed_at: string | null;
      agent_response: string | null;
      error: string | null;
      data_diff: string | null;
      assertions: string | null;
      system_prompt_info: string | null;
      input_context: string | null;
      stderr_logs: string | null;
    } | undefined;

    if (!sr) return null;

    // Pobierz tool_calls i messages
    const toolCallRows = this.db.prepare(`
      SELECT * FROM tool_calls WHERE scenario_result_id = ? ORDER BY tool_order
    `).all(sr.id) as Array<{
      tool_order: number;
      tool_name: string;
      input: string | null;
      output: string | null;
      timestamp: number | null;
      duration_ms: number | null;
    }>;

    const messageRows = this.db.prepare(`
      SELECT * FROM messages WHERE scenario_result_id = ? ORDER BY message_order
    `).all(sr.id) as Array<{
      message_order: number;
      role: string;
      timestamp: number | null;
      content: string;
      parent_tool_use_id: string | null;
    }>;

    return {
      id: sr.id,
      scenarioId: sr.scenario_id,
      scenarioName: sr.scenario_name || undefined,
      passed: sr.passed === 1,
      toolCalls: toolCallRows.map(tc => ({
        order: tc.tool_order,
        toolName: tc.tool_name,
        input: tc.input ? JSON.parse(tc.input) : undefined,
        output: tc.output ? JSON.parse(tc.output) : undefined,
        timestamp: tc.timestamp || undefined,
        durationMs: tc.duration_ms || undefined,
      })),
      messages: messageRows.map(m => ({
        role: m.role as 'user' | 'assistant',
        timestamp: m.timestamp || undefined,
        content: JSON.parse(m.content),
        parentToolUseId: m.parent_tool_use_id || undefined,
      })),
      dataDiff: sr.data_diff ? JSON.parse(sr.data_diff) : undefined,
      assertions: sr.assertions ? JSON.parse(sr.assertions) : undefined,
      metrics: {
        inputTokens: sr.input_tokens || 0,
        outputTokens: sr.output_tokens || 0,
        totalTokens: sr.tokens,
        latencyMs: sr.latency_ms,
        turnCount: sr.turn_count || 0,
      },
      agentResponse: sr.agent_response || undefined,
      error: sr.error || undefined,
      startedAt: sr.started_at || undefined,
      completedAt: sr.completed_at || undefined,
      systemPromptInfo: sr.system_prompt_info ? JSON.parse(sr.system_prompt_info) : undefined,
      inputContext: sr.input_context ? JSON.parse(sr.input_context) : undefined,
      stderrLogs: sr.stderr_logs ? JSON.parse(sr.stderr_logs) : undefined,
    };
  }

  /**
   * Pobiera data_diff dla scenariusza
   * Używane przez RenderService do aplikowania zmian na fixtures
   */
  getScenarioDataDiff(suiteId: string, scenarioId: string): {
    blocks: {
      added: Array<{ id: string; data: Record<string, unknown> }>;
      modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
      deleted: Array<{ id: string; data: Record<string, unknown> }>;
    };
    timelines: {
      added: Array<{ id: string; data: Record<string, unknown> }>;
      modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
      deleted: Array<{ id: string; data: Record<string, unknown> }>;
    };
    mediaAssets: {
      added: Array<{ id: string; data: Record<string, unknown> }>;
      modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
      deleted: Array<{ id: string; data: Record<string, unknown> }>;
    };
  } | null {
    const row = this.db.prepare(`
      SELECT data_diff FROM scenario_results
      WHERE suite_run_id = ? AND scenario_id = ?
    `).get(suiteId, scenarioId) as { data_diff: string | null } | undefined;

    return row?.data_diff ? JSON.parse(row.data_diff) : null;
  }

  /**
   * Dodaje tag do suite'a
   */
  addTag(suiteId: string, tag: string): void {
    const row = this.db.prepare('SELECT tags FROM suite_runs WHERE id = ?').get(suiteId) as { tags: string } | undefined;
    if (!row) return;

    const tags = JSON.parse(row.tags || '[]');
    if (!tags.includes(tag)) {
      tags.push(tag);
      this.db.prepare('UPDATE suite_runs SET tags = ? WHERE id = ?').run(JSON.stringify(tags), suiteId);
    }
  }

  /**
   * Historia scenariusza przez wszystkie suite'y
   */
  getScenarioHistory(scenarioId: string, limit = 20): Array<{
    suiteRunId: string;
    suiteCreatedAt: string;
    passed: boolean;
    tokens: number;
    latencyMs: number;
  }> {
    const rows = this.db.prepare(`
      SELECT sr.id as suite_run_id, sr.created_at as suite_created_at, sc.passed, sc.tokens, sc.latency_ms
      FROM scenario_results sc
      JOIN suite_runs sr ON sc.suite_run_id = sr.id
      WHERE sc.scenario_id = ?
      ORDER BY sr.created_at DESC
      LIMIT ?
    `).all(scenarioId, limit) as Array<{
      suite_run_id: string;
      suite_created_at: string;
      passed: number;
      tokens: number;
      latency_ms: number;
    }>;

    return rows.map((row) => ({
      suiteRunId: row.suite_run_id,
      suiteCreatedAt: row.suite_created_at,
      passed: row.passed === 1,
      tokens: row.tokens,
      latencyMs: row.latency_ms,
    }));
  }

  /**
   * Wyszukuje scenariusze, które użyły danego narzędzia
   */
  getScenariosByToolName(toolName: string, limit = 50): Array<{
    suiteId: string;
    suiteCreatedAt: string;
    scenarioId: string;
    scenarioName?: string;
    passed: boolean;
    toolCallCount: number;
  }> {
    const rows = this.db.prepare(`
      SELECT DISTINCT
        sr.id as suite_id,
        sr.created_at as suite_created_at,
        sc.scenario_id,
        sc.scenario_name,
        sc.passed,
        (SELECT COUNT(*) FROM tool_calls tc2 WHERE tc2.scenario_result_id = sc.id AND tc2.tool_name = ?) as tool_call_count
      FROM tool_calls tc
      JOIN scenario_results sc ON tc.scenario_result_id = sc.id
      JOIN suite_runs sr ON sc.suite_run_id = sr.id
      WHERE tc.tool_name = ? OR tc.tool_name LIKE ?
      ORDER BY sr.created_at DESC
      LIMIT ?
    `).all(toolName, toolName, `%${toolName}%`, limit) as Array<{
      suite_id: string;
      suite_created_at: string;
      scenario_id: string;
      scenario_name: string | null;
      passed: number;
      tool_call_count: number;
    }>;

    return rows.map(row => ({
      suiteId: row.suite_id,
      suiteCreatedAt: row.suite_created_at,
      scenarioId: row.scenario_id,
      scenarioName: row.scenario_name || undefined,
      passed: row.passed === 1,
      toolCallCount: row.tool_call_count,
    }));
  }

  /**
   * Eksportuje suite do formatu JSON (dla debugowania)
   */
  exportSuiteToJson(suiteId: string): object | null {
    const suite = this.getSuiteRun(suiteId);
    if (!suite) return null;

    return {
      id: suite.id,
      createdAt: suite.createdAt,
      tags: suite.tags,
      label: suite.label,
      configSnapshot: suite.configSnapshot,
      status: suite.status,
      summary: suite.summary,
      results: suite.results,
    };
  }

  /**
   * Usuwa suite run i wszystkie powiązane dane
   */
  deleteSuiteRun(suiteId: string): boolean {
    const exists = this.db.prepare('SELECT id FROM suite_runs WHERE id = ?').get(suiteId);
    if (!exists) return false;

    // Usuń tool_calls i messages (przez scenario_results)
    this.db.exec(`
      DELETE FROM tool_calls WHERE scenario_result_id IN (SELECT id FROM scenario_results WHERE suite_run_id = '${suiteId}');
      DELETE FROM messages WHERE scenario_result_id IN (SELECT id FROM scenario_results WHERE suite_run_id = '${suiteId}');
      DELETE FROM scenario_results WHERE suite_run_id = '${suiteId}';
      DELETE FROM suite_runs WHERE id = '${suiteId}';
    `);

    return true;
  }

  /**
   * Zamyka połączenie z bazą
   */
  close(): void {
    this.db.close();
  }
}

// Singleton
let instance: ResultsStore | null = null;

export function getResultsStore(): ResultsStore {
  if (!instance) {
    instance = new ResultsStore();
  }
  return instance;
}
