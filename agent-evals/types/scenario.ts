/**
 * Test Scenario Types - definicje scenariuszy testowych dla agentów
 */

import type { ContextRef } from '../../../shared/types';

// ============================================================================
// FIXTURES
// ============================================================================

export interface FixtureSet {
  // === JSON fixtures (stare podejście - zachowane dla kompatybilności) ===

  /** Nazwa pliku fixture projektu (bez .json) - wymagane dla JSON fixtures */
  project?: string;
  /** Nazwa pliku fixture chaptera (opcjonalnie) */
  chapter?: string;
  /** Nazwa pliku fixture bloków (opcjonalnie) */
  blocks?: string;
  /** Nazwa pliku fixture timeline'ów (opcjonalnie) */
  timelines?: string;
  /** Nazwa pliku fixture media assets (opcjonalnie) */
  mediaAssets?: string;

  // === SQLite fixtures (nowe podejście) ===

  /**
   * UUID projektu w fixtures.db - wskazuje na konkretny projekt w bazie fixtures
   * Używaj gdy fixtures są tworzone przez główną aplikację Clamka
   */
  projectId?: string;
  /**
   * UUID chaptera w fixtures.db - wskazuje na konkretny chapter do załadowania
   * Jeśli nie podano, ładowane są wszystkie chaptery projektu
   */
  chapterId?: string;
}

// ============================================================================
// EXPECTATIONS
// ============================================================================

export interface ToolCallExpectations {
  /** Narzędzia które MUSZĄ być wywołane */
  required?: string[];
  /** Narzędzia które MOGĄ być wywołane */
  optional?: string[];
  /** Narzędzia które NIE MOGĄ być wywołane */
  forbidden?: string[];
  /** Oczekiwana kolejność wywołań (podzbiór required) */
  order?: string[];
}

export interface MatchCondition {
  equals?: number | string | boolean;
  gte?: number;
  lte?: number;
  gt?: number;
  lt?: number;
  contains?: string;
  matches?: string; // regex
  oneOf?: (number | string | boolean)[];
}

export interface BlockMatchCondition {
  match: {
    id?: string;
    timelineId?: string;
    blockType?: string;
    startFrame?: MatchCondition;
    durationInFrames?: MatchCondition;
    [key: string]: string | MatchCondition | undefined;
  };
  changes?: {
    [key: string]: MatchCondition;
  };
}

export interface FinalStateExpectations {
  blocks?: {
    added?: BlockMatchCondition[];
    modified?: BlockMatchCondition[];
    deleted?: string[]; // block IDs
    unchanged?: string[]; // block IDs
  };
  timelines?: {
    added?: Array<{ match: Record<string, unknown> }>;
    modified?: Array<{ match: Record<string, unknown>; changes: Record<string, MatchCondition> }>;
    deleted?: string[];
  };
  mediaAssets?: {
    added?: Array<{ match: Record<string, unknown> }>;
  };
}

// ============================================================================
// REFERENCE TAGS
// ============================================================================

/**
 * Oczekiwanie dotyczące pojedynczego tagu referencyjnego
 *
 * Pozwala sprawdzać dowolne atrybuty tagu przez MatchCondition.
 * Np. <block id="abc" type="video">Label</block>
 */
export interface ReferenceTagExpectation {
  /** Typ tagu (np. 'block', 'timeline', 'chapter', 'mediaAsset') */
  tag: string;
  /** Warunki dla atrybutów tagu (id, type, name, etc.) */
  attrs?: Record<string, string | MatchCondition>;
  /** Warunek dla etykiety (zawartości tagu) */
  label?: MatchCondition;
}

/**
 * Oczekiwania dotyczące tagów referencyjnych w odpowiedzi agenta
 */
export interface ReferenceTagsExpectations {
  /** Tagi które MUSZĄ występować w odpowiedzi */
  required?: ReferenceTagExpectation[];
  /** Tagi które NIE MOGĄ występować w odpowiedzi */
  forbidden?: ReferenceTagExpectation[];
  /** Minimalna liczba tagów danego typu */
  minCount?: { tag: string; count: number }[];
  /** Maksymalna liczba tagów danego typu */
  maxCount?: { tag: string; count: number }[];
}

// ============================================================================
// AGENT BEHAVIOR
// ============================================================================

export interface AgentBehaviorExpectation {
  type: 'clarification_question' | 'tool_call' | 'completion';
  /** Dla clarification_question - wzorzec regex (może być RegExp lub string dla serializacji JSON) */
  pattern?: RegExp | string;
  /** Dla tool_call - nazwa narzędzia */
  tool?: string;
  /** Dla tool_call - oczekiwane argumenty */
  args?: Record<string, MatchCondition>;
  /** Alternatywy (agent może zachować się na jeden z sposobów) */
  oneOf?: AgentBehaviorExpectation[];
}

// ============================================================================
// TEST SCENARIO
// ============================================================================

/**
 * Kontekst przekazywany do agenta w scenariuszu testowym.
 * Identyfikatory projektId/chapterId są wymagane - wskazują aktywne elementy.
 * Dane jak fps, workspaceWidth, etc. są automatycznie pobierane z fixtures.
 */
export interface ScenarioInputContext {
  /** ID aktywnego projektu (wymagane) */
  projectId: string;
  /** ID aktywnego chaptera (wymagane) */
  chapterId: string;
  /**
   * Referencje kontekstowe (zaznaczone elementy).
   * Format zgodny z aplikacją: { type: 'block'|'segment'|'chapter'|'scene', id: string }
   */
  contextRefs?: ContextRef[];
  /** Opcjonalnie: nadpisanie FPS (domyślnie z project settings) */
  customFps?: number;
  /** Inne dodatkowe dane kontekstowe */
  [key: string]: unknown;
}

export interface ScenarioInput {
  /** Wiadomość użytkownika do agenta */
  userMessage: string;
  /** Kontekst przekazywany do agenta */
  context: ScenarioInputContext;
}

export interface ScenarioExpectations {
  /** Oczekiwania dotyczące wywołań narzędzi */
  toolCalls?: ToolCallExpectations;
  /** Oczekiwany stan końcowy danych */
  finalState?: FinalStateExpectations;
  /** Oczekiwane zachowanie agenta */
  agentBehavior?: AgentBehaviorExpectation;
  /** Oczekiwania dotyczące tagów referencyjnych w odpowiedzi */
  referenceTags?: ReferenceTagsExpectations;
}

/**
 * Opcjonalny custom system prompt dla scenariusza testowego
 *
 * Pozwala testować różne warianty promptów i porównywać wyniki.
 * Jeśli nie podano, używany jest domyślny prompt z pliku shared/prompts/agents/{agent}.md
 */
export interface SystemPromptConfig {
  /**
   * Opcja 1: Pełny tekst promptu (zastępuje domyślny)
   * Używaj gdy chcesz testować całkowicie inny prompt.
   */
  raw?: string;

  /**
   * Opcja 2: Ścieżka do pliku z promptem (względna od cwd)
   * Np. 'testing/prompts/montage-v2.md'
   */
  file?: string;

  /**
   * Opcja 3: Patche na domyślny prompt
   * Pozwala na drobne modyfikacje bez przepisywania całego promptu.
   */
  patches?: {
    /** Tekst do znalezienia */
    find: string;
    /** Tekst zastępczy */
    replace: string;
  }[];

  /**
   * Tryb aplikacji promptu:
   * - 'append' (domyślny) - dodaje do claude_code system prompt
   * - 'replace' - całkowicie zastępuje claude_code system prompt
   */
  mode?: 'append' | 'replace';
}

export interface TestScenario {
  /** Unikalny identyfikator scenariusza */
  id: string;
  /** Nazwa scenariusza (human-readable) */
  name: string;
  /** Typ agenta do uruchomienia */
  agent: 'montage' | 'script' | 'media-scout' | string;
  /** Tagi do filtrowania */
  tags?: string[];
  /** Opis scenariusza */
  description?: string;
  /** Input dla agenta */
  input: ScenarioInput;
  /**
   * Oczekiwania - tablica zestawów oczekiwań (logika OR).
   * Test przechodzi jeśli JEDEN z zestawów pasuje.
   */
  expectations: ScenarioExpectations[];
  /** Timeout w ms (domyślnie 60000) */
  timeout?: number;

  /**
   * Opcjonalny custom system prompt dla tego scenariusza.
   *
   * Jeśli nie podano, używany jest domyślny prompt z pliku .md
   * Prompt jest zapisywany w ConfigSnapshot do porównania.
   */
  systemPrompt?: SystemPromptConfig;
}

// ============================================================================
// TEST RESULT
// ============================================================================

export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  timestamp: number;
  order: number;
  durationMs: number;
}

// ============================================================================
// RAW MESSAGES (dla debugowania i live streaming)
// ============================================================================

/**
 * Pojedynczy blok zawartości wiadomości
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

/**
 * Surowa wiadomość z konwersacji agenta
 * Reprezentuje pojedynczą wiadomość (user lub assistant)
 */
export interface RawMessage {
  /** Typ wiadomości: 'user' (tool_result) lub 'assistant' (tool_use, text) */
  role: 'user' | 'assistant';
  /** Timestamp w ms */
  timestamp: number;
  /** Zawartość wiadomości - tablica bloków */
  content: ContentBlock[];
}

/**
 * Informacja o użytym system prompcie
 */
export interface SystemPromptInfo {
  source: 'default' | 'custom-raw' | 'custom-file' | 'patched';
  sourceFile?: string;
  patches?: { find: string; replace: string }[];
  /** Surowy template system promptu (z placeholderami {{...}}) */
  content?: string;
  /** Przetworzony prompt z rozwiązanymi placeholderami (finalny prompt wysłany do AI) */
  resolvedContent?: string;
}

export interface AssertionResult {
  name: string;
  passed: boolean;
  /**
   * Jeśli true, asercja nie wpływa na allPassed() nawet gdy passed=false.
   * Używane dla toolCalls.required gdy finalState jest OK - staje się "soft check"
   * (informacyjne, ale nie blokuje testu).
   */
  softCheck?: boolean;
  message?: string;
  expected?: unknown;
  actual?: unknown;
}

export interface DataDiff {
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

export interface TestMetrics {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  latencyMs: number;
  turnCount: number;
}

export interface TestResult {
  id: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  toolCalls: ToolCall[];
  dataDiff: DataDiff;
  assertions: AssertionResult[];
  metrics: TestMetrics;
  agentResponse?: string;
  error?: string;
  startedAt: string;
  completedAt: string;

  /** Pełna historia wiadomości z konwersacji (dla debugowania) */
  messages?: RawMessage[];

  /** Informacje o użytym system prompcie */
  systemPromptInfo?: SystemPromptInfo;

  /** Oryginalna wiadomość użytkownika do agenta */
  userMessage?: string;

  /** Kontekst wejściowy scenariusza (projectId, chapterId, etc.) */
  inputContext?: ScenarioInputContext;
}

/**
 * Wynik scenariusza do zapisania w bazie danych
 * (podzbiór TestResult bez redundantnych pól jak id, scenarioId, scenarioName)
 */
export interface ScenarioResult {
  passed: boolean;
  toolCalls: ToolCall[];
  dataDiff?: DataDiff;
  assertions?: AssertionResult[];
  agentResponse?: string;
  error?: string;
  metrics?: TestMetrics;
  startedAt?: string;
  completedAt?: string;
}
