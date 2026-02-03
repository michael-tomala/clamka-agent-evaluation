/**
 * Tool Definitions Provider - pobiera definicje narzędzi MCP
 *
 * Wyekstrahowana logika z testing/api/routes/tools.ts
 * do wykorzystania w testable-agent-adapter.
 */
import { z } from 'zod';
import { getAllTools } from '../../../electron/services/mcp/tools/all-tools';
import { zodSchemaToParams } from '../../../electron/services/mcp/tools/utils/zodToParams';
import {
  MONTAGE_ALLOWED_TOOLS,
  SCRIPT_ALLOWED_TOOLS,
  isSdkBuiltinTool,
} from '../../../shared/prompts/agents/allowed-tools';
import type { McpServerContext } from '../../../electron/services/mcp/types';
import type { ToolParameter } from '../../../shared/types/agentPrompt';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
}

/**
 * Pobiera wszystkie definicje narzędzi MCP
 */
function getAllToolDefinitions(): ToolDefinition[] {
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

  const mockContext: McpServerContext = {
    projectId: 'mock-project',
    chapterId: 'mock-chapter',
  };

  getAllTools(mockTool, mockContext);

  return toolDefinitions.map((def) => ({
    name: def.name,
    description: def.description,
    parameters: zodSchemaToParams(def.schema),
  }));
}

/**
 * Pobiera definicje narzędzi dla agenta, filtrując do enabledTools
 */
export function getToolDefinitionsForAgent(
  agentType: 'montage' | 'script',
  enabledTools?: string[]
): ToolDefinition[] {
  const allDefs = getAllToolDefinitions();

  // Pobierz allowed tools dla agenta
  const allowedWithPrefix =
    agentType === 'montage' ? MONTAGE_ALLOWED_TOOLS : SCRIPT_ALLOWED_TOOLS;

  // Wyodrębnij nazwy narzędzi MCP (z prefiksem clamka-mcp)
  const allowedMcpNames = new Set(
    allowedWithPrefix
      .filter((t) => t.startsWith('mcp__clamka-mcp__'))
      .map((t) => t.replace('mcp__clamka-mcp__', ''))
  );

  // Wyodrębnij nazwy SDK built-in tools (bez prefiksu)
  const allowedSdkNames = allowedWithPrefix.filter((t) => isSdkBuiltinTool(t));

  // Filtruj MCP tools
  // NOTE: SDK builtin tools (Task, TodoWrite, etc.) są obsługiwane automatycznie przez Claude Agent SDK
  // Nie tworzymy dla nich definicji - SDK już je zna i ma wbudowane parametry (w tym subagent_type dla Task)
  let filtered = allDefs.filter((d) => allowedMcpNames.has(d.name));

  // Filtruj do enabledTools jeśli podane
  if (enabledTools && enabledTools.length > 0) {
    const enabledSet = new Set(enabledTools);
    filtered = filtered.filter((d) => enabledSet.has(d.name));
  }

  return filtered;
}
