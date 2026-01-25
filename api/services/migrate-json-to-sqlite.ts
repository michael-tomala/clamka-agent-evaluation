/**
 * Skrypt migracji danych z JSON do SQLite
 *
 * Uruchomienie: npx tsx testing/api/services/migrate-json-to-sqlite.ts
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const resultsDir = path.join(__dirname, '../../agent-evals/results');
const dbPath = path.join(resultsDir, 'evals.db');

interface ToolCallData {
  toolName: string;
  input?: unknown;
  output?: unknown;
  timestamp?: number;
  order?: number;
  durationMs?: number;
}

interface MessageData {
  role: 'user' | 'assistant';
  timestamp?: number;
  content: unknown[];
}

interface ScenarioResultData {
  id: string;
  scenarioId: string;
  scenarioName?: string;
  passed: boolean;
  toolCalls?: ToolCallData[];
  messages?: MessageData[];
  dataDiff?: unknown;
  assertions?: unknown[];
  metrics?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    turnCount?: number;
  };
  agentResponse?: string;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  systemPromptInfo?: unknown;
}

interface SuiteRunData {
  id: string;
  createdAt: string;
  tags?: string[];
  label?: string;
  configSnapshot?: unknown;
  scenarioIds?: string[];
  scenarioNames?: Record<string, string>;
  results?: ScenarioResultData[];
  summary?: unknown;
  status?: string;
  jobId?: string;
}

function migrateData(): void {
  console.log('🚀 Rozpoczynam migrację danych JSON → SQLite...\n');

  const db = new Database(dbPath);

  // Upewnij się, że schemat jest aktualny (wywołaj migrację)
  ensureSchema(db);

  const suitesDir = path.join(resultsDir, 'suites');
  const suiteDirs = fs.readdirSync(suitesDir).filter(d =>
    fs.statSync(path.join(suitesDir, d)).isDirectory()
  );

  console.log(`📁 Znaleziono ${suiteDirs.length} katalogów suite'ów\n`);

  let totalSuites = 0;
  let totalScenarios = 0;
  let totalToolCalls = 0;
  let totalMessages = 0;

  // Prepared statements
  const updateSuite = db.prepare(`
    UPDATE suite_runs
    SET config_snapshot = ?, scenario_ids = ?, scenario_names = ?
    WHERE id = ?
  `);

  const updateScenario = db.prepare(`
    UPDATE scenario_results
    SET scenario_name = ?, input_tokens = ?, output_tokens = ?, turn_count = ?,
        started_at = ?, completed_at = ?, agent_response = ?, error = ?,
        data_diff = ?, assertions = ?, system_prompt_info = ?
    WHERE suite_run_id = ? AND scenario_id = ?
  `);

  const insertScenario = db.prepare(`
    INSERT OR IGNORE INTO scenario_results
    (id, suite_run_id, scenario_id, passed, tokens, latency_ms, json_path,
     scenario_name, input_tokens, output_tokens, turn_count,
     started_at, completed_at, agent_response, error,
     data_diff, assertions, system_prompt_info)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertToolCall = db.prepare(`
    INSERT INTO tool_calls (scenario_result_id, tool_order, tool_name, input, output, timestamp, duration_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (scenario_result_id, message_order, role, timestamp, content)
    VALUES (?, ?, ?, ?, ?)
  `);

  const getScenarioResultId = db.prepare(`
    SELECT id FROM scenario_results WHERE suite_run_id = ? AND scenario_id = ?
  `);

  // Wyczyść istniejące tool_calls i messages (migracja od nowa)
  db.exec('DELETE FROM tool_calls');
  db.exec('DELETE FROM messages');

  for (const suiteDir of suiteDirs) {
    const suiteJsonPath = path.join(suitesDir, suiteDir, 'suite-run.json');

    if (!fs.existsSync(suiteJsonPath)) {
      console.log(`⚠️  Pominięto ${suiteDir} - brak suite-run.json`);
      continue;
    }

    try {
      const suiteData: SuiteRunData = JSON.parse(fs.readFileSync(suiteJsonPath, 'utf-8'));

      // Update suite z nowymi danymi
      updateSuite.run(
        suiteData.configSnapshot ? JSON.stringify(suiteData.configSnapshot) : null,
        suiteData.scenarioIds ? JSON.stringify(suiteData.scenarioIds) : null,
        suiteData.scenarioNames ? JSON.stringify(suiteData.scenarioNames) : null,
        suiteData.id
      );

      totalSuites++;
      console.log(`📦 Suite: ${suiteData.id.substring(0, 8)} (${suiteData.label || 'bez labela'})`);

      // Migruj scenariusze
      if (suiteData.results && suiteData.results.length > 0) {
        for (const result of suiteData.results) {
          // Sprawdź czy scenariusz istnieje w bazie
          let scenarioRow = getScenarioResultId.get(suiteData.id, result.scenarioId) as { id: string } | undefined;

          if (!scenarioRow) {
            // Jeśli nie istnieje, dodaj nowy rekord
            insertScenario.run(
              result.id,
              suiteData.id,
              result.scenarioId,
              result.passed ? 1 : 0,
              result.metrics?.totalTokens || 0,
              result.metrics?.latencyMs || 0,
              '', // json_path już niepotrzebne
              result.scenarioName || null,
              result.metrics?.inputTokens || null,
              result.metrics?.outputTokens || null,
              result.metrics?.turnCount || null,
              result.startedAt || null,
              result.completedAt || null,
              result.agentResponse || null,
              result.error || null,
              result.dataDiff ? JSON.stringify(result.dataDiff) : null,
              result.assertions ? JSON.stringify(result.assertions) : null,
              result.systemPromptInfo ? JSON.stringify(result.systemPromptInfo) : null
            );
            scenarioRow = { id: result.id };
          } else {
            // Update istniejącego scenariusza
            updateScenario.run(
              result.scenarioName || null,
              result.metrics?.inputTokens || null,
              result.metrics?.outputTokens || null,
              result.metrics?.turnCount || null,
              result.startedAt || null,
              result.completedAt || null,
              result.agentResponse || null,
              result.error || null,
              result.dataDiff ? JSON.stringify(result.dataDiff) : null,
              result.assertions ? JSON.stringify(result.assertions) : null,
              result.systemPromptInfo ? JSON.stringify(result.systemPromptInfo) : null,
              suiteData.id,
              result.scenarioId
            );
          }

          const scenarioResultId = scenarioRow.id;
          totalScenarios++;

          // Dodaj tool_calls
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
              totalToolCalls++;
            }
          }

          // Dodaj messages
          if (result.messages && result.messages.length > 0) {
            let msgOrder = 0;
            for (const msg of result.messages) {
              insertMessage.run(
                scenarioResultId,
                msgOrder++,
                msg.role,
                msg.timestamp || null,
                JSON.stringify(msg.content)
              );
              totalMessages++;
            }
          }
        }
      }

    } catch (err) {
      console.error(`❌ Błąd przy przetwarzaniu ${suiteDir}:`, err);
    }
  }

  db.close();

  console.log('\n✅ Migracja zakończona!');
  console.log(`   Suite'ów: ${totalSuites}`);
  console.log(`   Scenariuszy: ${totalScenarios}`);
  console.log(`   Tool calls: ${totalToolCalls}`);
  console.log(`   Messages: ${totalMessages}`);
}

function ensureSchema(db: Database.Database): void {
  // Sprawdź i dodaj brakujące kolumny do suite_runs
  const suiteColumns = db.prepare("PRAGMA table_info(suite_runs)").all() as Array<{ name: string }>;
  const suiteColumnNames = new Set(suiteColumns.map(c => c.name));

  if (!suiteColumnNames.has('config_snapshot')) {
    db.exec("ALTER TABLE suite_runs ADD COLUMN config_snapshot TEXT");
  }
  if (!suiteColumnNames.has('scenario_ids')) {
    db.exec("ALTER TABLE suite_runs ADD COLUMN scenario_ids TEXT");
  }
  if (!suiteColumnNames.has('scenario_names')) {
    db.exec("ALTER TABLE suite_runs ADD COLUMN scenario_names TEXT");
  }

  // Sprawdź i dodaj brakujące kolumny do scenario_results
  const scenarioColumns = db.prepare("PRAGMA table_info(scenario_results)").all() as Array<{ name: string }>;
  const scenarioColumnNames = new Set(scenarioColumns.map(c => c.name));

  const newScenarioColumns = [
    'scenario_name TEXT',
    'input_tokens INTEGER',
    'output_tokens INTEGER',
    'turn_count INTEGER',
    'started_at TEXT',
    'completed_at TEXT',
    'agent_response TEXT',
    'error TEXT',
    'user_message TEXT',
    'data_diff TEXT',
    'assertions TEXT',
    'system_prompt_info TEXT'
  ];

  for (const col of newScenarioColumns) {
    const colName = col.split(' ')[0];
    if (!scenarioColumnNames.has(colName)) {
      db.exec(`ALTER TABLE scenario_results ADD COLUMN ${col}`);
    }
  }

  // Utwórz tabele tool_calls i messages
  db.exec(`
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
}

// Uruchom migrację
migrateData();
