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
  /** Logi stderr z Claude CLI */
  stderrLogs?: string[];
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
  | { type: 'thinking'; thinking: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface RawMessage {
  role: 'user' | 'assistant' | 'system';
  timestamp: number;
  content: ContentBlock[];
  /** ID parent tool_use jeśli to wiadomość trans agenta */
  parentToolUseId?: string;
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
  transAgentPrompts?: Record<string, { raw?: string; mode?: 'append' | 'replace' }>;
  /** Włączone narzędzia dla trans agentów (klucz = typ trans agenta, wartość = lista nazw narzędzi) */
  transAgentEnabledTools?: Record<string, string[]>;
  /** Custom konfiguracja subagentów (Task tool) */
  subagentPrompts?: Record<string, SubagentPromptConfig>;
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
  /** Zagnieżdżone właściwości dla z.object() */
  properties?: ToolParameter[];
  /** Typ elementu dla z.array() (np. 'object', 'string') */
  itemType?: string;
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
  /** Custom prompty dla trans agentów (klucz = typ np. 'media-scout') */
  transAgentPrompts?: Record<string, TransAgentPromptConfig>;
  /** Włączone narzędzia dla trans agentów (klucz = typ trans agenta, wartość = lista nazw narzędzi) */
  transAgentEnabledTools?: Record<string, string[]>;
  /** Custom konfiguracja subagentów (Task tool) */
  subagentPrompts?: Record<string, SubagentPromptConfig>;
}

export interface AgentPromptResponse {
  agent: string;
  prompt: string;
  source: string;
}

export interface TransAgentPromptResponse {
  transAgentType: string;
  prompt: string;
  source: string;
}

export interface TransAgentToolsResponse {
  transAgentType: string;
  tools: string[];
}

/** Konfiguracja custom promptu dla trans agenta */
export interface TransAgentPromptConfig {
  raw?: string;
  mode?: 'append' | 'replace';
}

/** Konfiguracja subagenta (Task tool) dla testów */
export interface SubagentPromptConfig {
  /** Pełny tekst promptu (nadpisuje domyślny z pliku .md) */
  prompt?: string;
  /** Lista dozwolonych narzędzi (nadpisuje domyślne) */
  tools?: string[];
  /** Override modelu dla subagenta */
  model?: 'sonnet' | 'opus' | 'haiku';
}

export interface SubagentPromptResponse {
  subagentType: string;
  prompt: string;
  source: string;
}

export interface SubagentToolsResponse {
  subagentType: string;
  tools: string[];
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
// LANCEDB TYPES
// ============================================================================

export interface LanceDbStatus {
  exists: boolean;
  path: string;
  tables: string[];
}

export interface LanceDbProjectCount {
  projectId: string;
  count: number;
}

export interface LanceDbTableStats {
  tableName: string;
  displayName: string;
  totalCount: number;
  byProject: LanceDbProjectCount[];
}

export interface LanceDbSampleRecord {
  [key: string]: string | number | null;
}

export interface LanceDbSearchResult {
  id: string;
  projectId: string;
  text?: string;
  score: number;
  distance: number;
}

export interface LanceDbSearchResponse {
  results: LanceDbSearchResult[];
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
// CLAUDE VISION TEST TYPES
// ============================================================================

export interface ClaudeVisionTestRequest {
  videoPath: string;
  prompt?: string;
  model?: string;
  frameWidth?: number;
  maxFrames?: number;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
}

export interface ClaudeVisionSpriteSheet {
  base64: string;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
}

export interface ClaudeVisionSceneDescription {
  location: string;
  content: string;
  mood: string;
  subjects: string[];
  actions: string[];
  cameraMovement: string;
  framing: string;
}

export interface ClaudeVisionTestResponse {
  messages: RawMessage[];
  spriteSheet: ClaudeVisionSpriteSheet;
  videoMetadata: { width: number; height: number; fps: number; duration: number; frameCount: number };
  parsed: ClaudeVisionSceneDescription | null;
  parseError?: string;
  defaultPrompt: string;
  defaultSystemPrompt: string;
  usedPrompt: string;
  durationMs: number;
  usedSystemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
  tokenUsage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  /** ID zapisanego testu (automatycznie dodawane przez backend) */
  savedTestId?: string;
}

/** Rekord testu zapisany w bazie */
export interface ClaudeVisionTestRecord {
  id: string;
  createdAt: string;
  videoPath: string;
  model: string;
  frameWidth: number;
  maxFrames: number;
  prompt: string;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
  videoWidth?: number;
  videoHeight?: number;
  videoFps?: number;
  videoDuration?: number;
  videoFrameCount?: number;
  spriteCols?: number;
  spriteRows?: number;
  spriteFrameWidth?: number;
  spriteFrameHeight?: number;
  spriteTotalFrames?: number;
  spriteFilePath?: string;
  parsedResult?: ClaudeVisionSceneDescription;
  parseError?: string;
  rawResponse: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
  costUsd?: number;
  label?: string;
}

/** Konfiguracja testu do załadowania */
export interface ClaudeVisionTestConfig {
  videoPath: string;
  model: string;
  frameWidth: number;
  maxFrames: number;
  prompt: string;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
}

// ============================================================================
// RENDER TYPES
// ============================================================================

export type RenderStatus = 'pending' | 'rendering' | 'encoding' | 'completed' | 'error';

export interface RenderJob {
  jobId: string;
  projectId: string;
  chapterId: string;
  status: RenderStatus;
  progress: number;
  currentFrame?: number;
  totalFrames?: number;
  previewFrame?: string;
  videoUrl?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

// ============================================================================
// COMPOSITION TEST TYPES
// ============================================================================

export interface CompositionTestFixture {
  id: string;
  compositionDefinitionId: string;
  variantName: string;
  description: string;
  props: Record<string, unknown>;
  width: number;
  height: number;
  durationInFrames: number;
  fps: number;
  tags: string[];
}

export interface CompositionRenderJobStatus {
  jobId: string;
  fixtureId: string;
  compositionDefinitionId: string;
  variantName: string;
  status: 'pending' | 'rendering' | 'encoding' | 'completed' | 'error';
  progress: number;
  outputPath?: string;
  error?: string;
  renderDurationMs?: number;
  startedAt: string;
  completedAt?: string;
}

export interface CompositionBatchStatus {
  batchId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  completedCount: number;
  totalCount: number;
}

export interface CompositionRenderedFile {
  fixtureId: string;
  filePath: string;
  sizeBytes: number;
  engine: 'remotion' | 'puppeteer';
}

// ============================================================================
// TRANSCRIPTION EVAL TYPES
// ============================================================================

export type TranscriptionBackend = 'whisper-cpp' | 'openai' | 'elevenlabs';

export interface GroundTruthSegment {
  id: string;
  assetId: string;
  text: string;
  startMs: number;
  endMs: number;
  fileRelativeStartFrame: number;
  fileRelativeEndFrame: number;
  orderIndex: number;
  speakerId?: string | null;
  createdDate: string;
  modifiedDate: string;
}

export interface TranscriptionAssetConfig {
  id: string;
  assetId: string;
  audioFilePath: string;
  sourceFps: number;
  language: string;
  label?: string;
  createdDate: string;
}

export interface TranscriptionSegmentOutput {
  text: string;
  startMs: number;
  endMs: number;
  speakerId?: string | null;
}

export interface SegmentMatch {
  groundTruth: GroundTruthSegment;
  predicted: TranscriptionSegmentOutput | null;
  startDiffMs: number | null;
  endDiffMs: number | null;
  iou: number;
  textSimilarity: number;
  matched: boolean;
}

export interface TranscriptionEvalResult {
  id: string;
  evalRunId: string;
  assetId: string;
  backend: TranscriptionBackend;
  language: string;
  options: Record<string, unknown>;
  avgStartDiffMs: number;
  avgEndDiffMs: number;
  maxStartDiffMs: number;
  maxEndDiffMs: number;
  matchPercentage: number;
  avgIoU: number;
  totalGroundTruthSegments: number;
  totalPredictedSegments: number;
  segmentMatches: SegmentMatch[];
  predictedSegments: TranscriptionSegmentOutput[];
  transcriptionDurationMs: number;
  createdDate: string;
}

export interface TranscriptionEvalRun {
  id: string;
  label?: string;
  backend: TranscriptionBackend;
  language: string;
  assetIds: string[];
  status: 'pending' | 'running' | 'completed' | 'error';
  totalAssets: number;
  completedAssets: number;
  results: TranscriptionEvalResult[];
  createdDate: string;
  completedDate?: string;
}

export interface TranscriptionEvalJob {
  jobId: string;
  evalRunId: string;
  status: 'pending' | 'running' | 'completed' | 'error';
  currentAssetId?: string;
  completedAssets: number;
  totalAssets: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface BackendStatus {
  available: boolean;
  error?: string;
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

  getTransAgentPrompt: (transAgentType: string) =>
    fetchJson<TransAgentPromptResponse>(`/prompts/transagent/${transAgentType}`),

  getTransAgentTools: (transAgentType: string) =>
    fetchJson<TransAgentToolsResponse>(`/tools/transagent/${transAgentType}`),

  getSubagentPrompt: (subagentType: string) =>
    fetchJson<SubagentPromptResponse>(`/prompts/subagent/${subagentType}`),

  getSubagentTools: (subagentType: string) =>
    fetchJson<SubagentToolsResponse>(`/tools/subagent/${subagentType}`),

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

  // LanceDB
  getLanceDbStatus: () => fetchJson<LanceDbStatus>('/fixtures/lancedb/status'),

  getLanceDbTableStats: (tableName: string) =>
    fetchJson<LanceDbTableStats>(`/fixtures/lancedb/tables/${tableName}/stats`),

  getLanceDbTableSample: (
    tableName: string,
    params?: { limit?: number; projectId?: string }
  ) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.projectId) query.set('projectId', params.projectId);
    return fetchJson<LanceDbSampleRecord[]>(
      `/fixtures/lancedb/tables/${tableName}/sample?${query}`
    );
  },

  searchLanceDbTable: (
    tableName: string,
    params: { query: string; projectId?: string; limit?: number }
  ) =>
    fetchJson<LanceDbSearchResponse>(
      `/fixtures/lancedb/tables/${tableName}/search`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    ),

  // Claude Vision
  getClaudeVisionDefaultPrompt: () =>
    fetchJson<{ prompt: string; systemPrompt: string }>('/claude-vision/default-prompt'),

  analyzeClaudeVision: (params: ClaudeVisionTestRequest) =>
    fetchJson<ClaudeVisionTestResponse>('/claude-vision/analyze', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  // Claude Vision - History
  getClaudeVisionTests: (params?: { limit?: number; offset?: number; model?: string }) => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    if (params?.model) query.set('model', params.model);
    return fetchJson<{ tests: ClaudeVisionTestRecord[] }>(`/claude-vision/tests?${query}`);
  },

  getClaudeVisionTest: (id: string) =>
    fetchJson<ClaudeVisionTestRecord>(`/claude-vision/tests/${id}`),

  getClaudeVisionTestSprite: (id: string) =>
    fetchJson<{ base64: string }>(`/claude-vision/tests/${id}/sprite`),

  getClaudeVisionTestConfig: (id: string) =>
    fetchJson<ClaudeVisionTestConfig>(`/claude-vision/tests/${id}/config`),

  deleteClaudeVisionTest: (id: string) =>
    fetchJson<{ success: boolean }>(`/claude-vision/tests/${id}`, {
      method: 'DELETE',
    }),

  updateClaudeVisionTestLabel: (id: string, label: string | null) =>
    fetchJson<{ success: boolean }>(`/claude-vision/tests/${id}/label`, {
      method: 'POST',
      body: JSON.stringify({ label }),
    }),

  // Render
  renderChapter: (
    projectId: string,
    chapterId: string,
    options?: { suiteId?: string; scenarioId?: string; engine?: 'remotion' | 'puppeteer' }
  ) =>
    fetchJson<{ jobId: string; status: string; message: string }>('/render/chapter', {
      method: 'POST',
      body: JSON.stringify({ projectId, chapterId, ...options }),
    }),

  getRenderStatus: (jobId: string) =>
    fetchJson<RenderJob>(`/render/${jobId}/status`),

  deleteRender: (jobId: string) =>
    fetchJson<{ success: boolean; message: string }>(`/render/${jobId}`, {
      method: 'DELETE',
    }),

  // Composition Tests
  getCompositionFixtures: () =>
    fetchJson<CompositionTestFixture[]>('/composition-tests/fixtures'),

  getCompositionFixturesByDefinition: (definitionId: string) =>
    fetchJson<CompositionTestFixture[]>(`/composition-tests/fixtures/${definitionId}`),

  renderComposition: (fixtureId: string, engine: 'remotion' | 'puppeteer' = 'puppeteer', useBackgroundVideo?: boolean, debug?: boolean) =>
    fetchJson<{ jobId: string; status: string; message: string }>('/composition-tests/render', {
      method: 'POST',
      body: JSON.stringify({ fixtureId, engine, useBackgroundVideo, debug }),
    }),

  renderCompositionBatch: (definitionId?: string, engine: 'remotion' | 'puppeteer' = 'puppeteer', useBackgroundVideo?: boolean) =>
    fetchJson<{ batchId: string; status: string; totalCount: number; message: string }>('/composition-tests/render-batch', {
      method: 'POST',
      body: JSON.stringify({ definitionId, engine, useBackgroundVideo }),
    }),

  getCompositionJobStatus: (jobId: string) =>
    fetchJson<CompositionRenderJobStatus>(`/composition-tests/jobs/${jobId}`),

  getCompositionBatchStatus: (batchId: string) =>
    fetchJson<CompositionBatchStatus>(`/composition-tests/batch/${batchId}`),

  getCompositionRenders: (engine?: 'remotion' | 'puppeteer') =>
    fetchJson<CompositionRenderedFile[]>(`/composition-tests/renders${engine ? `?engine=${engine}` : ''}`),

  deleteCompositionRender: (fixtureId: string, engine?: 'remotion' | 'puppeteer') =>
    fetchJson<{ success: boolean; message: string }>(
      `/composition-tests/renders/${fixtureId}${engine ? `?engine=${engine}` : ''}`,
      { method: 'DELETE' }
    ),

  // Transcription Evals - Backends
  getTranscriptionBackends: () =>
    fetchJson<Record<TranscriptionBackend, BackendStatus>>('/transcription-evals/backends'),

  // Transcription Evals - Asset Configs
  getTranscriptionAssetConfigs: () =>
    fetchJson<TranscriptionAssetConfig[]>('/transcription-evals/asset-configs'),

  upsertTranscriptionAssetConfig: (config: {
    assetId: string; audioFilePath: string; sourceFps?: number; language?: string; label?: string;
  }) =>
    fetchJson<TranscriptionAssetConfig>('/transcription-evals/asset-configs', {
      method: 'POST',
      body: JSON.stringify(config),
    }),

  deleteTranscriptionAssetConfig: (assetId: string) =>
    fetchJson<{ success: boolean }>(`/transcription-evals/asset-configs/${assetId}`, {
      method: 'DELETE',
    }),

  // Transcription Evals - Audio
  getTranscriptionAudioUrl: (assetId: string) =>
    `${API_BASE}/transcription-evals/audio/${assetId}`,

  // Transcription Evals - Ground Truth
  getAssetsWithGroundTruth: () =>
    fetchJson<Array<{ assetId: string; segmentCount: number }>>('/transcription-evals/ground-truth'),

  getGroundTruth: (assetId: string) =>
    fetchJson<GroundTruthSegment[]>(`/transcription-evals/ground-truth/${assetId}`),

  createGroundTruthSegment: (segment: {
    assetId: string; text: string; startMs: number; endMs: number; sourceFps: number; orderIndex: number; speakerId?: string;
  }) =>
    fetchJson<GroundTruthSegment>('/transcription-evals/ground-truth', {
      method: 'POST',
      body: JSON.stringify(segment),
    }),

  updateGroundTruthSegment: (id: string, update: {
    text?: string; startMs?: number; endMs?: number; sourceFps?: number; orderIndex?: number; speakerId?: string | null;
  }) =>
    fetchJson<GroundTruthSegment>(`/transcription-evals/ground-truth/${id}`, {
      method: 'PUT',
      body: JSON.stringify(update),
    }),

  deleteGroundTruthSegment: (id: string) =>
    fetchJson<{ success: boolean }>(`/transcription-evals/ground-truth/${id}`, {
      method: 'DELETE',
    }),

  importGroundTruth: (assetId: string, segments: Array<{
    assetId: string; text: string; startMs: number; endMs: number; sourceFps: number; orderIndex: number; speakerId?: string;
  }>) =>
    fetchJson<{ imported: number; segments: GroundTruthSegment[] }>(
      `/transcription-evals/ground-truth/${assetId}/import`,
      { method: 'POST', body: JSON.stringify({ segments }) }
    ),

  exportGroundTruth: (assetId: string) =>
    fetchJson<{ assetId: string; segments: GroundTruthSegment[] }>(
      `/transcription-evals/ground-truth/${assetId}/export`
    ),

  // Transcription Evals - Run
  runTranscriptionEval: (params: {
    assetIds: string[]; backend: TranscriptionBackend; language?: string;
    options?: Record<string, unknown>; label?: string;
  }) =>
    fetchJson<{ jobId: string; evalRunId: string; status: string; totalAssets: number; message: string }>(
      '/transcription-evals/run',
      { method: 'POST', body: JSON.stringify(params) }
    ),

  getTranscriptionEvalJobStatus: (jobId: string) =>
    fetchJson<TranscriptionEvalJob>(`/transcription-evals/jobs/${jobId}`),

  // Transcription Evals - Results
  getTranscriptionEvalRuns: (limit?: number) =>
    fetchJson<TranscriptionEvalRun[]>(`/transcription-evals/runs${limit ? `?limit=${limit}` : ''}`),

  getTranscriptionEvalRun: (runId: string) =>
    fetchJson<TranscriptionEvalRun>(`/transcription-evals/runs/${runId}`),

  deleteTranscriptionEvalRun: (runId: string) =>
    fetchJson<{ success: boolean }>(`/transcription-evals/runs/${runId}`, { method: 'DELETE' }),

  getTranscriptionEvalResult: (resultId: string) =>
    fetchJson<TranscriptionEvalResult>(`/transcription-evals/results/${resultId}`),

  getTranscriptionAssetHistory: (assetId: string, limit?: number) =>
    fetchJson<TranscriptionEvalResult[]>(
      `/transcription-evals/history/${assetId}${limit ? `?limit=${limit}` : ''}`
    ),
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
