/**
 * API Client dla Dashboard
 */

const API_BASE = '/api';

// ============================================================================
// TYPES
// ============================================================================

export interface Scenario {
  path: string;
  agent: string;
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  available: boolean;
}

export interface JobStatus {
  jobId: string;
  status: 'waiting' | 'running' | 'completed' | 'failed';
  currentScenario?: string;
  completedScenarios: number;
  totalScenarios: number;
  results: TestResult[];
  toolCalls: ToolCall[];
}

export interface TestResult {
  id: string;
  scenarioId: string;
  scenarioName: string;
  passed: boolean;
  toolCalls: ToolCall[];
  metrics: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    latencyMs: number;
    turnCount: number;
  };
  error?: string;
  messages?: RawMessage[];
  systemPromptInfo?: SystemPromptInfo;
  dataDiff?: DataDiff;
  /** Oryginalna wiadomość użytkownika do agenta */
  userMessage?: string;
  /** Timestamp rozpoczęcia testu */
  startedAt?: string;
  /** Kontekst wejściowy scenariusza (projectId, chapterId, etc.) */
  inputContext?: ScenarioInputContext;
}

export interface ToolCall {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  timestamp: number;
  order: number;
  durationMs: number;
}

// ============================================================================
// RAW MESSAGES
// ============================================================================

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: unknown; is_error?: boolean }
  | { type: 'thinking'; thinking: string };

export interface RawMessage {
  role: 'user' | 'assistant';
  timestamp: number;
  content: ContentBlock[];
}

export interface SystemPromptInfo {
  source: 'default' | 'custom-raw' | 'custom-file' | 'patched';
  sourceFile?: string;
  patches?: { find: string; replace: string }[];
  /** Surowy template system promptu (z placeholderami {{...}}) */
  content?: string;
  /** Przetworzony prompt z rozwiązanymi placeholderami (finalny prompt wysłany do AI) */
  resolvedContent?: string;
}

/** Mapowanie toolName -> paramName -> customDescription */
export type ToolParameterDescriptions = Record<string, Record<string, string>>;

export interface ConfigSnapshot {
  model?: string;
  thinkingMode?: string;
  enabledTools?: string[];
  disabledTools?: string[];
  systemPromptSource?: string;
  systemPromptMode?: 'append' | 'replace';
  systemPromptRaw?: string;
  toolDescriptions?: Record<string, string>;
  toolParameterDescriptions?: ToolParameterDescriptions;
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
  status?: SuiteStatus;
  jobId?: string;
  currentScenario?: string;
  progress?: {
    completed: number;
    total: number;
  };
  scenarioStatuses?: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'>;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
}

export interface ToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface ToolInfo {
  name: string;
  description: string;
  category: string;
  enabledByDefault: boolean;
  parameters: ToolParameter[];
}

export interface ToolsResponse {
  tools: ToolInfo[];
  allowedForAgent: string[];
}

export interface RunSuiteParams {
  agent?: string;
  scenarioIds?: string[];
  tags?: string[];
  verbose?: boolean;
  systemPrompt?: { raw?: string; mode?: 'append' | 'replace' };
  model?: 'haiku' | 'sonnet' | 'opus';
  thinkingMode?: 'think' | 'hard' | 'harder' | 'ultrathink';
  enabledTools?: string[];
  disabledTools?: string[];
  toolDescriptions?: Record<string, string>;
  toolParameterDescriptions?: ToolParameterDescriptions;
}

export interface AgentPromptResponse {
  agent: string;
  prompt: string;
  source: string;
}

// ============================================================================
// FIXTURES TYPES
// ============================================================================

export interface FixtureProject {
  id: string;
  name: string;
  createdDate: string;
  lastModified: string;
  chaptersCount: number;
  mediaAssetsCount: number;
}

export interface FixtureChapter {
  id: string;
  projectId: string;
  title: string;
  templateId: string;
  orderIndex: number;
  timelinesCount: number;
  blocksCount: number;
}

export interface FixtureTimeline {
  id: string;
  chapterId: string;
  type: string;
  label: string;
  orderIndex: number;
  blocksCount: number;
}

export interface FixtureBlock {
  id: string;
  timelineId: string;
  blockType: string;
  mediaAssetId: string | null;
  timelineOffsetInFrames: number;
  fileRelativeStartFrame: number;
  fileRelativeEndFrame: number | null;
  orderIndex: number;
}

export interface FixtureMediaAsset {
  id: string;
  projectId: string;
  mediaType: string;
  fileName: string;
  filePath: string;
  orderIndex: number | null;
}

export interface FixturesStatus {
  exists: boolean;
  path: string;
  instructions: string;
}

// ============================================================================
// TEST SCENARIO DEFINITION (from agent-evals/types/scenario.ts)
// ============================================================================

export interface ScenarioInputContext {
  projectId: string;
  chapterId: string;
  contextRefs?: Array<{ type: string; id: string }>;
  [key: string]: unknown;
}

export interface ScenarioInput {
  userMessage: string;
  context: ScenarioInputContext;
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

export interface TestScenarioDefinition {
  id: string;
  name: string;
  agent: string;
  tags?: string[];
  description?: string;
  input: ScenarioInput;
  expectations: Array<Record<string, unknown>>;
  timeout?: number;
  systemPrompt?: {
    raw?: string;
    file?: string;
    patches?: { find: string; replace: string }[];
    mode?: 'append' | 'replace';
  };
}

// ============================================================================
// API CALLS
// ============================================================================

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string>),
  };
  // Only add Content-Type for requests with body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Scenarios
export const api = {
  // Scenarios
  getScenarios: () => fetchJson<Scenario[]>('/scenarios'),

  getScenario: (path: string) => fetchJson<Scenario>(`/scenarios/${path}`),

  getScenarioDefinition: (scenarioPath: string) =>
    fetchJson<TestScenarioDefinition>(`/scenarios/${scenarioPath}`),

  runScenario: (path: string, options?: { verbose?: boolean }) =>
    fetchJson<{ jobId: string; scenarioId: string }>(`/scenarios/${path}/run`, {
      method: 'POST',
      body: JSON.stringify(options || {}),
    }),

  runSuite: (params: RunSuiteParams) =>
    fetchJson<{ jobId: string; suiteId: string; scenarioCount: number; scenarioIds: string[] }>('/scenarios/run-suite', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Tools
  getTools: (agent?: string) =>
    fetchJson<ToolsResponse>(`/tools${agent ? `?agent=${agent}` : ''}`),

  // Prompts
  getAgentPrompt: (agent: string) =>
    fetchJson<AgentPromptResponse>(`/prompts/${agent}`),

  // Jobs
  getJobStatus: (jobId: string) => fetchJson<JobStatus>(`/jobs/${jobId}`),

  getJobResult: (jobId: string) => fetchJson<TestResult[]>(`/jobs/${jobId}/result`),

  // Queue
  getQueueStats: () => fetchJson<QueueStats>('/queue/stats'),

  // Suites
  getSuites: (params?: { limit?: number; offset?: number; tags?: string[] }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.tags) query.set('tags', params.tags.join(','));
    return fetchJson<SuiteRun[]>(`/suites?${query}`);
  },

  getSuite: (suiteId: string) => fetchJson<SuiteRun & { results: TestResult[] }>(`/suites/${suiteId}`),

  getSuiteScenarios: (suiteId: string) =>
    fetchJson<
      Array<{
        id: string;
        name: string;
        passed: boolean;
        tokens: number;
        latencyMs: number;
        turnCount: number;
        toolCalls: string[];
        error?: string;
      }>
    >(`/suites/${suiteId}/scenarios`),

  getScenarioResult: (suiteId: string, scenarioId: string) =>
    fetchJson<TestResult>(`/suites/${suiteId}/scenarios/${encodeURIComponent(scenarioId)}`),

  compareSuites: (suiteId1: string, suiteId2: string) =>
    fetchJson<{
      suite1: { id: string; createdAt: string; tags: string[] };
      suite2: { id: string; createdAt: string; tags: string[] };
      comparison: Array<{
        scenarioId: string;
        suite1: { passed: boolean; tokens: number; latencyMs: number } | null;
        suite2: { passed: boolean; tokens: number; latencyMs: number } | null;
        change: 'fixed' | 'regressed' | 'unchanged' | 'new' | 'removed';
        tokensDiff?: number;
        tokensDiffPercent?: number;
      }>;
      totalTokensDiff: number;
      totalTokensDiffPercent: number;
    }>(`/suites/${suiteId1}/compare/${suiteId2}`),

  addTag: (suiteId: string, tag: string) =>
    fetchJson<{ success: boolean }>(`/suites/${suiteId}/tag`, {
      method: 'POST',
      body: JSON.stringify({ tag }),
    }),

  stopSuite: (suiteId: string) =>
    fetchJson<{
      success: boolean;
      message: string;
      suiteId: string;
      currentScenario?: string;
      remainingScenarios: number;
    }>(`/suites/${suiteId}/stop`, { method: 'POST' }),

  // Trends
  getScenarioTrend: (scenarioId: string, limit?: number) =>
    fetchJson<{
      scenarioId: string;
      history: Array<{
        suiteRunId: string;
        suiteCreatedAt: string;
        passed: boolean;
        tokens: number;
        latencyMs: number;
      }>;
    }>(`/trends/${scenarioId}?limit=${limit || 20}`),

  // Fixtures
  getFixturesStatus: () => fetchJson<FixturesStatus>('/fixtures/status'),

  getFixtureProjects: () => fetchJson<FixtureProject[]>('/fixtures/projects'),

  getFixtureChapters: (projectId: string) =>
    fetchJson<FixtureChapter[]>(`/fixtures/projects/${projectId}/chapters`),

  getFixtureTimelines: (chapterId: string) =>
    fetchJson<FixtureTimeline[]>(`/fixtures/chapters/${chapterId}/timelines`),

  getFixtureBlocks: (timelineId: string) =>
    fetchJson<FixtureBlock[]>(`/fixtures/timelines/${timelineId}/blocks`),

  getFixtureMediaAssets: (projectId: string) =>
    fetchJson<FixtureMediaAsset[]>(`/fixtures/projects/${projectId}/media-assets`),
};

// ============================================================================
// WEBSOCKET
// ============================================================================

export function subscribeToJob(
  jobId: string,
  onEvent: (event: {
    type: string;
    jobId: string;
    scenarioId?: string;
    scenarioName?: string;
    toolCall?: ToolCall;
    message?: RawMessage;
    result?: TestResult;
    summary?: { passed: number; failed: number; total: number };
    error?: string;
    totalScenarios?: number;
  }) => void
): () => void {
  let isMounted = true;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}${API_BASE}/stream/${jobId}`);

  ws.onopen = () => {
    if (isMounted) {
      console.log(`[WebSocket] Connected to job: ${jobId}`);
    }
  };

  ws.onmessage = (event) => {
    if (!isMounted) return;
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };

  ws.onerror = (error) => {
    if (isMounted) {
      console.error('WebSocket error:', error);
    }
  };

  ws.onclose = () => {
    if (isMounted) {
      console.log(`[WebSocket] Disconnected from job: ${jobId}`);
    }
  };

  // Cleanup function - NIE zamykaj WebSocket w stanie CONNECTING
  // ponieważ to powoduje błąd "WebSocket is closed before the connection is established"
  return () => {
    isMounted = false;
    if (ws.readyState === WebSocket.OPEN) {
      // Połączenie otwarte - zamknij natychmiast
      ws.close();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      // Połączenie w trakcie - nadpisz onopen aby zamknąć po nawiązaniu
      ws.onopen = () => ws.close();
    }
    // Dla CLOSING lub CLOSED - nic nie rób
  };
}

export interface SuiteEvent {
  type: string;
  jobId: string;
  suiteId?: string;
  scenarioId?: string;
  scenarioName?: string;
  toolCall?: ToolCall;
  message?: RawMessage;
  result?: TestResult;
  summary?: { passed: number; failed: number; total: number };
  error?: string;
  totalScenarios?: number;
}

/**
 * Subskrybuj eventy dla suite'a
 */
export function subscribeToSuite(
  suiteId: string,
  onEvent: (event: SuiteEvent) => void
): () => void {
  let isMounted = true;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}${API_BASE}/stream/suite/${suiteId}`);

  ws.onopen = () => {
    if (isMounted) {
      console.log(`[WebSocket] Connected to suite: ${suiteId}`);
    }
  };

  ws.onmessage = (event) => {
    if (!isMounted) return;
    try {
      const data = JSON.parse(event.data);
      onEvent(data);
    } catch (e) {
      console.error('WebSocket parse error:', e);
    }
  };

  ws.onerror = (error) => {
    if (isMounted) {
      console.error('WebSocket error:', error);
    }
  };

  ws.onclose = () => {
    if (isMounted) {
      console.log(`[WebSocket] Disconnected from suite: ${suiteId}`);
    }
  };

  return () => {
    isMounted = false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else if (ws.readyState === WebSocket.CONNECTING) {
      ws.onopen = () => ws.close();
    }
  };
}
