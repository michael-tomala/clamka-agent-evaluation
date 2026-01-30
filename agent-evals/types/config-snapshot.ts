/**
 * Config Snapshot Types - typy dla snapshotowania konfiguracji agentów
 */

// ============================================================================
// SUITE LEVEL - wspólna konfiguracja agenta
// ============================================================================

export interface SuiteRun {
  id: string;
  createdAt: string;
  tags: string[];
  label?: string;

  /** Konfiguracja agenta (wspólna dla wszystkich scenariuszy) */
  configSnapshot: SuiteConfigSnapshot;

  /** Wyniki scenariuszy */
  scenarioResults: ScenarioRunResult[];

  /** Podsumowanie */
  summary: {
    total: number;
    passed: number;
    failed: number;
    totalTokens: number;
    totalLatencyMs: number;
  };
}

export interface SuiteConfigSnapshot {
  agentConfig: AgentConfigSnapshot;
  systemPrompt: SystemPromptSnapshot;
  mcpTools: McpToolsSnapshot;
  /** Hash do szybkiego porównania */
  configHash: string;
}

// ============================================================================
// AGENT CONFIG
// ============================================================================

export interface AgentConfigSnapshot {
  agentType: string;
  model: string;
  thinkingMode?: string;
  maxTokens?: number;
  temperature?: number;
  subagents?: SubagentConfigSnapshot[];
}

export interface SubagentConfigSnapshot {
  name: string;
  agentType: string;
  model?: string;
  description?: string;
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

export interface SystemPromptSnapshot {
  /**
   * Źródło promptu:
   * - 'default' - domyślny z pliku shared/prompts/agents/{agent}.md
   * - 'custom-raw' - pełny tekst podany w scenariuszu (systemPrompt.raw)
   * - 'custom-file' - załadowany z pliku (systemPrompt.file)
   * - 'patched' - domyślny z nałożonymi patchami (systemPrompt.patches)
   */
  source: 'default' | 'custom-raw' | 'custom-file' | 'patched';

  /** Ścieżka do pliku źródłowego (jeśli source='custom-file' lub 'default') */
  sourceFile?: string;

  /** Patche nałożone na prompt (jeśli source='patched') */
  patches?: { find: string; replace: string }[];

  /** Surowy prompt przed {{...}} */
  rawPrompt: string;
  /** Po rozwiązaniu placeholderów */
  resolvedPrompt: string;
  /** Kontekst używany do resolucji */
  resolveContext: PromptResolveContext;
  /** Lista placeholderów z wartościami */
  placeholders: PlaceholderResolution[];
  /** Dynamiczne listy (templates, track types, etc.) */
  dynamicLists: {
    templates?: string[];
    trackTypes?: string[];
    blockTypes?: string[];
    compositions?: string[];
  };
}

export interface PromptResolveContext {
  projectId?: string;
  chapterId?: string;
  fps?: number;
  [key: string]: unknown;
}

export interface PlaceholderResolution {
  placeholder: string;
  value: string;
  source: 'context' | 'settings' | 'dynamic' | 'default';
}

// ============================================================================
// MCP TOOLS
// ============================================================================

export interface McpToolsSnapshot {
  allowedTools: string[];
  toolDefinitions: ToolDefinitionSnapshot[];
  mcpServers: string[];
}

export interface ToolDefinitionSnapshot {
  name: string;
  fullName: string;
  description: string;
  parameters: ToolParameterSnapshot[];
}

export interface ToolParameterSnapshot {
  name: string;
  type: string;
  description: string;
  required: boolean;
  enum?: string[];
  default?: unknown;
}

// ============================================================================
// SCENARIO LEVEL - dane startowe + wynik
// ============================================================================

export interface ScenarioRunResult {
  scenarioId: string;
  scenarioName: string;

  /** Dane startowe (fixtures) - PEŁNY SNAPSHOT */
  fixtures: ScenarioFixtures;

  /** Input */
  input: {
    userMessage: string;
    context: Record<string, unknown>;
  };

  /** Oczekiwania */
  expectations: ScenarioExpectationsSnapshot;

  /** Wynik */
  result: {
    passed: boolean;
    toolCalls: ToolCallSnapshot[];
    dataDiff: DataDiffSnapshot;
    assertions: AssertionResultSnapshot[];
    metrics: ScenarioMetrics;
  };
}

// ============================================================================
// FIXTURES - pełny stan danych startowych
// ============================================================================

export interface ScenarioFixtures {
  /** Projekt */
  project: {
    id: string;
    name: string;
    settings: {
      fps: number;
      workspaceWidth: number;
      workspaceHeight: number;
      [key: string]: unknown;
    };
  };

  /** Chapter (opcjonalny) */
  chapter?: {
    id: string;
    title: string;
    templateId: string;
    [key: string]: unknown;
  };

  /** Timelines */
  timelines: {
    id: string;
    type: string;
    label: string;
    orderIndex: number;
  }[];

  /** Bloki - PEŁNA KONFIGURACJA każdego bloku */
  blocks: {
    id: string;
    timelineId: string;
    blockType: string;
    timelineOffsetInFrames: number;
    durationInFrames: number;
    mediaAssetId?: string;
    settings: Record<string, unknown>;
  }[];

  /** Media Assets */
  mediaAssets: {
    id: string;
    mediaType: string;
    fileName: string;
    metadata: {
      sourceDurationInFrames?: number;
      sourceFps?: number;
      width?: number;
      height?: number;
    };
  }[];
}

// ============================================================================
// METRICS & RESULTS
// ============================================================================

export interface ScenarioMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  turnCount: number;
}

export interface ToolCallSnapshot {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  timestamp: number;
  order: number;
  durationMs: number;
}

export interface DataDiffSnapshot {
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
}

export interface AssertionResultSnapshot {
  name: string;
  passed: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface ScenarioExpectationsSnapshot {
  toolCalls?: {
    required?: string[];
    optional?: string[];
    forbidden?: string[];
    order?: string[];
  };
  finalState?: Record<string, unknown>;
  agentBehavior?: Record<string, unknown>;
}

// ============================================================================
// DIFF TYPES
// ============================================================================

export interface ConfigDiff {
  path: string;
  type: 'added' | 'removed' | 'changed';
  oldValue?: unknown;
  newValue?: unknown;
  severity: 'info' | 'warning' | 'critical';
}

export interface ConfigDiffResult {
  identical: boolean;
  hashMatch: boolean;
  differences: {
    agentConfig: ConfigDiff[];
    systemPrompt: ConfigDiff[];
    mcpTools: ConfigDiff[];
  };
  summary: {
    totalChanges: number;
    criticalChanges: string[];
  };
}
