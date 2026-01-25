/**
 * EvalStorageService - serwis do zapisywania wyników ewaluacji agentów
 *
 * Używa SQLite do przechowywania wyników testów.
 * Baza danych jest tworzona w testing/agent-evals/evals.db
 */

import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import type { ScenarioResult, TestScenario, ToolCall } from '../../agent-evals/types/scenario';

// Ścieżka do bazy danych (zachowujemy lokalizację w agent-evals/)
const DB_PATH = path.join(__dirname, '../../agent-evals/evals.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

// Typy
export interface SuiteRun {
  id: string;
  createdAt: string;
  tags?: string[];
  label?: string;
  configSnapshot: Record<string, unknown>;
  configHash: string;
  totalScenarios: number;
  passedScenarios: number;
  failedScenarios: number;
  totalTokens: number;
  totalLatencyMs: number;
}

export interface StoredScenarioResult {
  id: string;
  suiteRunId: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  fixtures: Record<string, unknown>;
  userMessage: string;
  context?: Record<string, unknown>;
  expectations?: Record<string, unknown>;
  toolCalls: ToolCall[];
  dataDiff?: Record<string, unknown>;
  assertions?: Record<string, unknown>;
  agentResponse?: string;
  error?: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  turnCount?: number;
  startedAt?: string;
  completedAt?: string;
}

export interface DiffResult {
  suiteRun1: SuiteRun;
  suiteRun2: SuiteRun;
  scenarios: {
    scenarioId: string;
    result1: StoredScenarioResult | null;
    result2: StoredScenarioResult | null;
    passedChanged: boolean;
    tokenDiff?: number;
    latencyDiff?: number;
  }[];
}

class EvalStorageServiceClass {
  private db: Database.Database | null = null;

  /**
   * Inicjalizuje bazę danych i tworzy tabele jeśli nie istnieją
   */
  private getDb(): Database.Database {
    if (this.db) {
      return this.db;
    }

    // Utwórz katalog jeśli nie istnieje
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    // Otwórz bazę danych
    this.db = new Database(DB_PATH);

    // Włącz foreign keys
    this.db.pragma('foreign_keys = ON');

    // Utwórz tabele z schema.sql
    if (fs.existsSync(SCHEMA_PATH)) {
      const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
      this.db.exec(schema);
    }

    return this.db;
  }

  /**
   * Generuje unikalny ID
   */
  private generateId(): string {
    return crypto.randomUUID();
  }

  /**
   * Oblicza hash konfiguracji dla porównań
   */
  private hashConfig(config: Record<string, unknown>): string {
    const configStr = JSON.stringify(config, Object.keys(config).sort());
    return crypto.createHash('sha256').update(configStr).digest('hex').substring(0, 16);
  }

  /**
   * Rozpoczyna nowy przebieg zestawu testów
   *
   * @param configSnapshot - Konfiguracja (prompty, modele, etc.)
   * @param tags - Opcjonalne tagi
   * @param label - Opcjonalna etykieta
   * @returns ID przebiegu
   */
  startSuiteRun(
    configSnapshot: Record<string, unknown>,
    tags?: string[],
    label?: string
  ): string {
    const db = this.getDb();
    const id = this.generateId();
    const configHash = this.hashConfig(configSnapshot);

    const stmt = db.prepare(`
      INSERT INTO suite_runs (
        id, created_at, tags, label, config_snapshot, config_hash,
        total_scenarios, passed_scenarios, failed_scenarios,
        total_tokens, total_latency_ms
      ) VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0)
    `);

    stmt.run(
      id,
      new Date().toISOString(),
      tags ? JSON.stringify(tags) : null,
      label || null,
      JSON.stringify(configSnapshot),
      configHash
    );

    return id;
  }

  /**
   * Zapisuje wynik scenariusza
   */
  saveScenarioResult(
    suiteRunId: string,
    scenario: TestScenario,
    result: ScenarioResult,
    fixtures: Record<string, unknown>
  ): void {
    const db = this.getDb();
    const id = this.generateId();

    const stmt = db.prepare(`
      INSERT INTO scenario_results (
        id, suite_run_id, scenario_id, scenario_name, passed,
        fixtures, user_message, context, expectations,
        tool_calls, data_diff, assertions, agent_response, error,
        input_tokens, output_tokens, latency_ms, turn_count,
        started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      suiteRunId,
      scenario.id,
      scenario.name,
      result.passed ? 1 : 0,
      JSON.stringify(fixtures),
      scenario.input.userMessage,
      scenario.input.context ? JSON.stringify(scenario.input.context) : null,
      scenario.expectations ? JSON.stringify(scenario.expectations) : null,
      JSON.stringify(result.toolCalls),
      result.dataDiff ? JSON.stringify(result.dataDiff) : null,
      result.assertions ? JSON.stringify(result.assertions) : null,
      result.agentResponse || null,
      result.error || null,
      result.metrics?.inputTokens || null,
      result.metrics?.outputTokens || null,
      result.metrics?.latencyMs || null,
      result.metrics?.turnCount || null,
      result.startedAt || null,
      result.completedAt || null
    );

    // Aktualizuj statystyki suite_run
    const updateStmt = db.prepare(`
      UPDATE suite_runs SET
        total_scenarios = total_scenarios + 1,
        passed_scenarios = passed_scenarios + ?,
        failed_scenarios = failed_scenarios + ?,
        total_tokens = total_tokens + ?,
        total_latency_ms = total_latency_ms + ?
      WHERE id = ?
    `);

    const totalTokens = (result.metrics?.inputTokens || 0) + (result.metrics?.outputTokens || 0);
    updateStmt.run(
      result.passed ? 1 : 0,
      result.passed ? 0 : 1,
      totalTokens,
      result.metrics?.latencyMs || 0,
      suiteRunId
    );
  }

  /**
   * Pobiera przebieg zestawu testów po ID
   */
  getSuiteRun(id: string): SuiteRun | null {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM suite_runs WHERE id = ?');
    const row = stmt.get(id) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    return this.mapSuiteRunRow(row);
  }

  /**
   * Lista przebiegów zestawów testów
   */
  listSuiteRuns(limit: number = 50): SuiteRun[] {
    const db = this.getDb();
    const stmt = db.prepare(`
      SELECT * FROM suite_runs
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as Record<string, unknown>[];

    return rows.map(row => this.mapSuiteRunRow(row));
  }

  /**
   * Pobiera wyniki scenariuszy dla przebiegu
   */
  getScenarioResults(suiteRunId: string): StoredScenarioResult[] {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM scenario_results WHERE suite_run_id = ?');
    const rows = stmt.all(suiteRunId) as Record<string, unknown>[];

    return rows.map(row => this.mapScenarioResultRow(row));
  }

  /**
   * Porównuje dwa przebiegi zestawów testów
   */
  compareSuiteRuns(id1: string, id2: string): DiffResult | null {
    const suiteRun1 = this.getSuiteRun(id1);
    const suiteRun2 = this.getSuiteRun(id2);

    if (!suiteRun1 || !suiteRun2) {
      return null;
    }

    const results1 = this.getScenarioResults(id1);
    const results2 = this.getScenarioResults(id2);

    // Grupuj po scenarioId
    const results1Map = new Map(results1.map(r => [r.scenarioId, r]));
    const results2Map = new Map(results2.map(r => [r.scenarioId, r]));

    // Znajdź wszystkie unikalne scenarioId
    const allScenarioIds = new Set([...results1Map.keys(), ...results2Map.keys()]);

    const scenarios = [...allScenarioIds].map(scenarioId => {
      const result1 = results1Map.get(scenarioId) || null;
      const result2 = results2Map.get(scenarioId) || null;

      const tokens1 = (result1?.inputTokens || 0) + (result1?.outputTokens || 0);
      const tokens2 = (result2?.inputTokens || 0) + (result2?.outputTokens || 0);

      return {
        scenarioId,
        result1,
        result2,
        passedChanged: result1?.passed !== result2?.passed,
        tokenDiff: tokens2 - tokens1,
        latencyDiff: (result2?.latencyMs || 0) - (result1?.latencyMs || 0)
      };
    });

    return {
      suiteRun1,
      suiteRun2,
      scenarios
    };
  }

  /**
   * Mapuje wiersz bazy danych na SuiteRun
   */
  private mapSuiteRunRow(row: Record<string, unknown>): SuiteRun {
    return {
      id: row.id as string,
      createdAt: row.created_at as string,
      tags: row.tags ? JSON.parse(row.tags as string) : undefined,
      label: row.label as string | undefined,
      configSnapshot: JSON.parse(row.config_snapshot as string),
      configHash: row.config_hash as string,
      totalScenarios: row.total_scenarios as number,
      passedScenarios: row.passed_scenarios as number,
      failedScenarios: row.failed_scenarios as number,
      totalTokens: row.total_tokens as number,
      totalLatencyMs: row.total_latency_ms as number
    };
  }

  /**
   * Mapuje wiersz bazy danych na StoredScenarioResult
   */
  private mapScenarioResultRow(row: Record<string, unknown>): StoredScenarioResult {
    return {
      id: row.id as string,
      suiteRunId: row.suite_run_id as string,
      scenarioId: row.scenario_id as string,
      scenarioName: row.scenario_name as string,
      passed: row.passed === 1,
      fixtures: JSON.parse(row.fixtures as string),
      userMessage: row.user_message as string,
      context: row.context ? JSON.parse(row.context as string) : undefined,
      expectations: row.expectations ? JSON.parse(row.expectations as string) : undefined,
      toolCalls: JSON.parse(row.tool_calls as string),
      dataDiff: row.data_diff ? JSON.parse(row.data_diff as string) : undefined,
      assertions: row.assertions ? JSON.parse(row.assertions as string) : undefined,
      agentResponse: row.agent_response as string | undefined,
      error: row.error as string | undefined,
      inputTokens: row.input_tokens as number | undefined,
      outputTokens: row.output_tokens as number | undefined,
      latencyMs: row.latency_ms as number | undefined,
      turnCount: row.turn_count as number | undefined,
      startedAt: row.started_at as string | undefined,
      completedAt: row.completed_at as string | undefined
    };
  }

  /**
   * Zamyka połączenie z bazą danych
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// Singleton export
export const evalStorageService = new EvalStorageServiceClass();
