-- Schema bazy danych dla wyników ewaluacji agentów
-- SQLite 3

-- Tabela suite_runs - każdy przebieg zestawu testów
CREATE TABLE IF NOT EXISTS suite_runs (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  tags TEXT,                    -- JSON array stringów (np. ["montage", "v1.5"])
  label TEXT,                   -- Opcjonalna etykieta (np. "Baseline before refactor")
  config_snapshot TEXT NOT NULL, -- JSON z konfiguracją (prompty, modele, etc.)
  config_hash TEXT NOT NULL,    -- Hash konfiguracji dla porównań
  total_scenarios INTEGER,
  passed_scenarios INTEGER,
  failed_scenarios INTEGER,
  total_tokens INTEGER,
  total_latency_ms INTEGER
);

-- Tabela scenario_results - wyniki pojedynczych scenariuszy
CREATE TABLE IF NOT EXISTS scenario_results (
  id TEXT PRIMARY KEY,
  suite_run_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,    -- ID scenariusza (np. "montage/move-first-block")
  scenario_name TEXT NOT NULL,  -- Nazwa scenariusza
  passed INTEGER NOT NULL,      -- 1 = passed, 0 = failed

  -- Dane wejściowe
  fixtures TEXT NOT NULL,       -- JSON z fixtures (bloki, timeline, etc.)
  user_message TEXT NOT NULL,   -- Wiadomość do agenta
  context TEXT,                 -- JSON z dodatkowym kontekstem
  expectations TEXT,            -- JSON z oczekiwaniami (tool calls, assertions)

  -- Dane wyjściowe
  tool_calls TEXT NOT NULL,     -- JSON array tool calls
  data_diff TEXT,               -- JSON diff stanu przed/po
  assertions TEXT,              -- JSON wyników asercji
  agent_response TEXT,          -- Odpowiedź agenta
  error TEXT,                   -- Błąd (jeśli failed)

  -- Metryki
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  turn_count INTEGER,

  -- Timestamps
  started_at TEXT,
  completed_at TEXT,

  FOREIGN KEY (suite_run_id) REFERENCES suite_runs(id)
);

-- Indeksy
CREATE INDEX IF NOT EXISTS idx_scenario_suite ON scenario_results(suite_run_id);
CREATE INDEX IF NOT EXISTS idx_scenario_id ON scenario_results(scenario_id);
CREATE INDEX IF NOT EXISTS idx_scenario_passed ON scenario_results(passed);
CREATE INDEX IF NOT EXISTS idx_suite_created ON suite_runs(created_at);
CREATE INDEX IF NOT EXISTS idx_suite_config_hash ON suite_runs(config_hash);
