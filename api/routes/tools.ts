/**
 * Tools Routes - API endpoint dla listy narzędzi MCP
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';
import { getAllTools } from '../../../desktop-app/electron/services/mcp/tools/all-tools';
import { zodSchemaToParams } from '../../../desktop-app/electron/services/mcp/tools/utils/zodToParams';
import {
  MONTAGE_ALLOWED_TOOLS,
  SCRIPT_ALLOWED_TOOLS,
  MEDIA_SCOUT_TRANSAGENT_ALLOWED_TOOLS,
} from '../../../desktop-app/shared/prompts/agents/allowed-tools';
import {
  EXPLORATOR_TOOLS,
  SCRIPT_SEGMENTS_EDITOR_TOOLS,
  SHARED_SUBAGENTS,
} from '../../../desktop-app/electron/services/agents/shared-subagents';
import type { McpServerContext } from '../../../desktop-app/electron/services/mcp/types';
import type { ToolParameter } from '../../../desktop-app/shared/types/agentPrompt';

// Ścieżka do głównego katalogu projektu
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// ============================================================================
// TYPES
// ============================================================================

interface ToolInfo {
  name: string;
  description: string;
  category: string;
  enabledByDefault: boolean;
  parameters: ToolParameter[];
}

interface ToolsResponse {
  tools: ToolInfo[];
  allowedForAgent: string[];
}

interface AgentPromptResponse {
  agent: string;
  prompt: string;
  source: string;
}

interface TransAgentPromptResponse {
  transAgentType: string;
  prompt: string;
  source: string;
}

interface TransAgentToolsResponse {
  transAgentType: string;
  tools: string[];
}

interface SubagentPromptResponse {
  subagentType: string;
  prompt: string;
  source: string;
}

interface SubagentToolsResponse {
  subagentType: string;
  tools: string[];
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Wyciąga kategorię z nazwy narzędzia (np. createChapters -> chapters)
 */
function getCategoryFromToolName(name: string): string {
  const categoryMap: Record<string, string> = {
    // Chapters
    listChapters: 'chapters',
    createChapters: 'chapters',
    updateChapter: 'chapters',
    deleteChapters: 'chapters',

    // Timelines
    listChapterTimelinesSimplifiedBlocks: 'timelines',
    getTimelineSettings: 'timelines',
    updateTimeline: 'timelines',
    createTimelines: 'timelines',

    // Blocks
    getBlockSettings: 'blocks',
    getSettingsSchema: 'blocks',
    splitBlock: 'blocks',
    removeBlocks: 'blocks',
    moveBlocks: 'blocks',
    trimBlock: 'blocks',
    createBlocksFromAssets: 'blocks',
    updateBlockSchemaSettings: 'blocks',
    getBlocksFocusPoints: 'blocks',
    getBlockTranscriptionSegments: 'blocks',

    // Script Segments
    listScriptSegments: 'script-segments',
    createScriptSegments: 'script-segments',
    updateScriptSegment: 'script-segments',
    deleteScriptSegment: 'script-segments',
    getProjectNarrative: 'script-segments',

    // Media Assets
    listMediaAssets: 'media-assets',
    getMediaAsset: 'media-assets',
    getMediaAssetsTranscriptions: 'media-assets',
    getMediaAssetsFocusPoints: 'media-assets',

    // Semantic Search
    searchScenes: 'semantic-search',

    // Persons
    listPersons: 'persons',
    findAssetsByPerson: 'persons',
    getPersonsOnAsset: 'persons',
    getPersonPresence: 'persons',

    // Compositions
    listCompositions: 'compositions',
    getComposition: 'compositions',

    // Render
    renderChapterFrame: 'render',
    renderChapterAudio: 'render',
    renderAssetFrame: 'render',

    // Download
    downloadMedia: 'download',
    downloadYouTube: 'download',

    // Gemini Image
    generateImage: 'ai-image',
    editImage: 'ai-image',

    // Trans Agent
    runTransAgent: 'trans-agent',
  };

  return categoryMap[name] || 'other';
}

/**
 * Pobiera listę narzędzi MCP z ich opisami i parametrami
 */
function getToolsList(): ToolInfo[] {
  // Tworzymy mock tool function żeby wyekstrahować definicje narzędzi
  const toolDefinitions: Array<{
    name: string;
    description: string;
    schema: Record<string, z.ZodTypeAny>;
  }> = [];

  const mockTool = (
    name: string,
    description: string,
    schema: Record<string, z.ZodTypeAny>,
    _handler: unknown
  ) => {
    toolDefinitions.push({ name, description, schema });
    return { name, description, inputSchema: schema, handler: () => {} };
  };

  // Tworzymy mock context
  const mockContext: McpServerContext = {
    projectId: 'mock-project',
    chapterId: 'mock-chapter',
  };

  // Wywołaj getAllTools z mock'ami - zbierze definicje wszystkich narzędzi
  getAllTools(mockTool, mockContext);

  // Mapuj na ToolInfo z kategorią i parametrami
  return toolDefinitions.map((def) => ({
    name: def.name,
    description: def.description,
    category: getCategoryFromToolName(def.name),
    enabledByDefault: true,
    parameters: zodSchemaToParams(def.schema),
  }));
}

/**
 * Pobiera listę dozwolonych narzędzi dla agenta (bez prefiksu mcp__clamka-mcp__)
 */
function getAllowedToolsForAgent(agent: string): string[] {
  const allowedWithPrefix =
    agent === 'montage' ? MONTAGE_ALLOWED_TOOLS : SCRIPT_ALLOWED_TOOLS;

  return allowedWithPrefix
    .filter((t) => t.startsWith('mcp__clamka-mcp__'))
    .map((t) => t.replace('mcp__clamka-mcp__', ''));
}

/**
 * Pobiera prompt agenta z pliku .md
 */
function getAgentPrompt(agent: string): AgentPromptResponse | null {
  const validAgents = ['montage', 'script'];
  if (!validAgents.includes(agent)) {
    return null;
  }

  const promptPath = `shared/prompts/agents/${agent}.md`;
  const fullPath = path.join(PROJECT_ROOT, promptPath);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const prompt = fs.readFileSync(fullPath, 'utf-8');
  return {
    agent,
    prompt,
    source: promptPath,
  };
}

/**
 * Pobiera prompt trans agenta z pliku .md
 */
function getTransAgentPrompt(transAgentType: string): TransAgentPromptResponse | null {
  const validTransAgents = ['media-scout'];
  if (!validTransAgents.includes(transAgentType)) {
    return null;
  }

  const promptPath = `shared/prompts/transagents/${transAgentType}.md`;
  const fullPath = path.join(PROJECT_ROOT, promptPath);

  if (!fs.existsSync(fullPath)) {
    return null;
  }

  const prompt = fs.readFileSync(fullPath, 'utf-8');
  return {
    transAgentType,
    prompt,
    source: promptPath,
  };
}

/**
 * Pobiera listę narzędzi dla trans agenta
 */
function getTransAgentTools(transAgentType: string): TransAgentToolsResponse | null {
  const toolsMap: Record<string, string[]> = {
    'media-scout': MEDIA_SCOUT_TRANSAGENT_ALLOWED_TOOLS,
  };

  const tools = toolsMap[transAgentType];
  if (!tools) {
    return null;
  }

  return {
    transAgentType,
    tools,
  };
}

/**
 * Lista dostępnych typów subagentów (Task tool)
 */
const VALID_SUBAGENT_TYPES = ['chapter-explorator', 'web-researcher', 'script-segments-editor'];

/**
 * Pobiera prompt subagenta z SHARED_SUBAGENTS lub pliku .md
 */
function getSubagentPrompt(subagentType: string): SubagentPromptResponse | null {
  if (!VALID_SUBAGENT_TYPES.includes(subagentType)) {
    return null;
  }

  const subagent = SHARED_SUBAGENTS[subagentType];
  if (!subagent) {
    return null;
  }

  return {
    subagentType,
    prompt: subagent.prompt, // getter wywoła odpowiednią funkcję ładującą z pliku .md
    source: `shared/prompts/subagents/${subagentType}.md`,
  };
}

/**
 * Pobiera listę narzędzi dla subagenta (Task tool)
 */
function getSubagentTools(subagentType: string): SubagentToolsResponse | null {
  const toolsMap: Record<string, string[]> = {
    'chapter-explorator': EXPLORATOR_TOOLS,
    'web-researcher': ['WebSearch', 'WebFetch'], // SDK builtin tools
    'script-segments-editor': SCRIPT_SEGMENTS_EDITOR_TOOLS,
  };

  const tools = toolsMap[subagentType];
  if (!tools) {
    return null;
  }

  // Normalizuj nazwy - usuń prefiks mcp__clamka-mcp__
  const normalizedTools = tools.map((t) =>
    t.startsWith('mcp__clamka-mcp__') ? t.replace('mcp__clamka-mcp__', '') : t
  );

  return {
    subagentType,
    tools: normalizedTools,
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function toolsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  /**
   * GET /api/tools - lista wszystkich narzędzi MCP
   *
   * Query params:
   * - agent: 'montage' | 'script' - filtruj narzędzia dozwolone dla agenta
   */
  fastify.get<{ Querystring: { agent?: string } }>('/tools', async (request, reply) => {
    const { agent } = request.query;

    const allTools = getToolsList();
    const allowedForAgent = agent ? getAllowedToolsForAgent(agent) : [];

    // Jeśli podano agenta, zaznacz które narzędzia są włączone
    const tools = allTools.map((tool) => ({
      ...tool,
      enabledByDefault: agent ? allowedForAgent.includes(tool.name) : true,
    }));

    const response: ToolsResponse = {
      tools,
      allowedForAgent,
    };

    return reply.send(response);
  });

  /**
   * GET /api/prompts/:agent - domyślny prompt agenta
   *
   * Zwraca zawartość pliku .md z promptem systemowym dla agenta.
   */
  fastify.get<{ Params: { agent: string } }>('/prompts/:agent', async (request, reply) => {
    const { agent } = request.params;
    const promptData = getAgentPrompt(agent);

    if (!promptData) {
      return reply.status(404).send({ error: `Prompt for agent '${agent}' not found` });
    }

    return reply.send(promptData);
  });

  /**
   * GET /api/prompts/transagent/:type - domyślny prompt trans agenta
   *
   * Zwraca zawartość pliku .md z promptem systemowym dla trans agenta.
   */
  fastify.get<{ Params: { type: string } }>('/prompts/transagent/:type', async (request, reply) => {
    const { type } = request.params;
    const promptData = getTransAgentPrompt(type);

    if (!promptData) {
      return reply.status(404).send({ error: `Prompt for trans agent '${type}' not found` });
    }

    return reply.send(promptData);
  });

  /**
   * GET /api/tools/transagent/:type - lista narzędzi dla trans agenta
   *
   * Zwraca listę nazw narzędzi dozwolonych dla danego typu trans agenta.
   */
  fastify.get<{ Params: { type: string } }>('/tools/transagent/:type', async (request, reply) => {
    const { type } = request.params;
    const toolsData = getTransAgentTools(type);

    if (!toolsData) {
      return reply.status(404).send({ error: `Tools for trans agent '${type}' not found` });
    }

    return reply.send(toolsData);
  });

  /**
   * GET /api/prompts/subagent/:type - domyślny prompt subagenta (Task tool)
   *
   * Zwraca prompt systemowy dla subagenta (chapter-explorator, web-researcher, script-segments-editor).
   */
  fastify.get<{ Params: { type: string } }>('/prompts/subagent/:type', async (request, reply) => {
    const { type } = request.params;
    const promptData = getSubagentPrompt(type);

    if (!promptData) {
      return reply.status(404).send({ error: `Prompt for subagent '${type}' not found` });
    }

    return reply.send(promptData);
  });

  /**
   * GET /api/tools/subagent/:type - lista narzędzi dla subagenta (Task tool)
   *
   * Zwraca listę nazw narzędzi dozwolonych dla danego typu subagenta.
   */
  fastify.get<{ Params: { type: string } }>('/tools/subagent/:type', async (request, reply) => {
    const { type } = request.params;
    const toolsData = getSubagentTools(type);

    if (!toolsData) {
      return reply.status(404).send({ error: `Tools for subagent '${type}' not found` });
    }

    return reply.send(toolsData);
  });
}
