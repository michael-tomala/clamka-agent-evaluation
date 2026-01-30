/**
 * Config Snapshot Collector - zbiera konfigurację agenta przed testem
 *
 * Pozwala na porównanie konfiguracji między runami.
 */

import crypto from 'crypto';
import type {
  SuiteConfigSnapshot,
  AgentConfigSnapshot,
  SystemPromptSnapshot,
  McpToolsSnapshot,
  ToolDefinitionSnapshot,
  PlaceholderResolution,
  ScenarioFixtures,
} from '../types/config-snapshot';
import type { TestScenario } from '../types/scenario';
import type { DataSnapshot } from '../storage/json-storage';

// ============================================================================
// INTERFACES
// ============================================================================

export interface IAgentConfigProvider {
  getAgentType(): string;
  getModel(): string;
  getThinkingMode?(): string;
  getMaxTokens?(): number;
  getSubagents?(): Array<{ name: string; agentType: string; model?: string; description?: string }>;
}

export interface IPromptProvider {
  getRawPrompt(agentType: string): string;
  resolvePrompt(agentType: string, context: Record<string, unknown>): string;
  getPlaceholders(agentType: string): Array<{ placeholder: string; source: string }>;
  getDynamicLists?(agentType: string): {
    templates?: string[];
    trackTypes?: string[];
    blockTypes?: string[];
    compositions?: string[];
  };
}

export interface IToolsProvider {
  getAllowedTools(agentType: string): string[];
  getToolDefinitions(agentType: string): Array<{
    name: string;
    fullName: string;
    description: string;
    parameters: Array<{
      name: string;
      type: string;
      description: string;
      required: boolean;
      enum?: string[];
      default?: unknown;
    }>;
  }>;
  getMcpServers(): string[];
}

// ============================================================================
// CONFIG SNAPSHOT COLLECTOR
// ============================================================================

export class ConfigSnapshotCollector {
  private agentProvider?: IAgentConfigProvider;
  private promptProvider?: IPromptProvider;
  private toolsProvider?: IToolsProvider;

  /**
   * Rejestruje providerów (dependency injection)
   */
  registerProviders(providers: {
    agent?: IAgentConfigProvider;
    prompt?: IPromptProvider;
    tools?: IToolsProvider;
  }): void {
    if (providers.agent) this.agentProvider = providers.agent;
    if (providers.prompt) this.promptProvider = providers.prompt;
    if (providers.tools) this.toolsProvider = providers.tools;
  }

  /**
   * Zbiera pełną konfigurację agenta
   */
  async collect(
    agentType: string,
    context: Record<string, unknown>
  ): Promise<SuiteConfigSnapshot> {
    const agentConfig = this.collectAgentConfig(agentType);
    const systemPrompt = this.collectSystemPrompt(agentType, context);
    const mcpTools = this.collectMcpTools(agentType);

    const configHash = this.computeHash({ agentConfig, systemPrompt, mcpTools });

    return {
      agentConfig,
      systemPrompt,
      mcpTools,
      configHash,
    };
  }

  /**
   * Zbiera konfigurację agenta
   */
  private collectAgentConfig(agentType: string): AgentConfigSnapshot {
    if (!this.agentProvider) {
      return {
        agentType,
        model: 'unknown',
      };
    }

    return {
      agentType: this.agentProvider.getAgentType(),
      model: this.agentProvider.getModel(),
      thinkingMode: this.agentProvider.getThinkingMode?.(),
      maxTokens: this.agentProvider.getMaxTokens?.(),
      subagents: this.agentProvider.getSubagents?.(),
    };
  }

  /**
   * Zbiera system prompt
   */
  private collectSystemPrompt(
    agentType: string,
    context: Record<string, unknown>
  ): SystemPromptSnapshot {
    if (!this.promptProvider) {
      return {
        rawPrompt: '',
        resolvedPrompt: '',
        resolveContext: context,
        placeholders: [],
        dynamicLists: {},
      };
    }

    const rawPrompt = this.promptProvider.getRawPrompt(agentType);
    const resolvedPrompt = this.promptProvider.resolvePrompt(agentType, context);
    const placeholderInfos = this.promptProvider.getPlaceholders(agentType);
    const dynamicLists = this.promptProvider.getDynamicLists?.(agentType) || {};

    // Resolve placeholder values
    const placeholders: PlaceholderResolution[] = placeholderInfos.map((p) => ({
      placeholder: p.placeholder,
      value: this.extractPlaceholderValue(rawPrompt, resolvedPrompt, p.placeholder),
      source: p.source as 'context' | 'settings' | 'dynamic' | 'default',
    }));

    return {
      rawPrompt,
      resolvedPrompt,
      resolveContext: context,
      placeholders,
      dynamicLists,
    };
  }

  /**
   * Wyciąga wartość placeholder'a z resolved prompt
   */
  private extractPlaceholderValue(
    rawPrompt: string,
    resolvedPrompt: string,
    placeholder: string
  ): string {
    // Prosta heurystyka - znajdź różnicę
    const pattern = `{{${placeholder}}}`;
    const index = rawPrompt.indexOf(pattern);
    if (index === -1) return '';

    // Znajdź tekst przed i po placeholderze
    const before = rawPrompt.slice(0, index);
    const after = rawPrompt.slice(index + pattern.length, index + pattern.length + 50);

    // Szukaj tych samych fragmentów w resolved
    const resolvedIndex = resolvedPrompt.indexOf(before) + before.length;
    const afterIndex = resolvedPrompt.indexOf(after, resolvedIndex);

    if (afterIndex === -1) {
      // Placeholder na końcu lub nietypowy przypadek
      return resolvedPrompt.slice(resolvedIndex).slice(0, 100);
    }

    return resolvedPrompt.slice(resolvedIndex, afterIndex);
  }

  /**
   * Zbiera narzędzia MCP
   */
  private collectMcpTools(agentType: string): McpToolsSnapshot {
    if (!this.toolsProvider) {
      return {
        allowedTools: [],
        toolDefinitions: [],
        mcpServers: [],
      };
    }

    return {
      allowedTools: this.toolsProvider.getAllowedTools(agentType),
      toolDefinitions: this.toolsProvider.getToolDefinitions(agentType),
      mcpServers: this.toolsProvider.getMcpServers(),
    };
  }

  /**
   * Oblicza hash konfiguracji
   */
  private computeHash(data: {
    agentConfig: AgentConfigSnapshot;
    systemPrompt: SystemPromptSnapshot;
    mcpTools: McpToolsSnapshot;
  }): string {
    // Normalizuj dane do porównania (pomiń zmienne elementy)
    const normalized = {
      agentConfig: {
        agentType: data.agentConfig.agentType,
        model: data.agentConfig.model,
        thinkingMode: data.agentConfig.thinkingMode,
      },
      systemPrompt: {
        rawPrompt: data.systemPrompt.rawPrompt,
        dynamicLists: data.systemPrompt.dynamicLists,
      },
      mcpTools: {
        allowedTools: data.mcpTools.allowedTools.sort(),
        toolDefinitions: data.mcpTools.toolDefinitions
          .map((t) => ({
            name: t.name,
            description: t.description,
            paramCount: t.parameters.length,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    };

    const json = JSON.stringify(normalized, null, 0);
    return crypto.createHash('sha256').update(json).digest('hex').slice(0, 16);
  }

  /**
   * Zbiera fixtures ze snapshota storage
   */
  collectFixtures(
    scenario: TestScenario,
    dataSnapshot: DataSnapshot
  ): ScenarioFixtures {
    const projectId = scenario.input.context.projectId as string;
    const chapterId = scenario.input.context.chapterId as string;

    // Project
    const project = dataSnapshot.projects.get(projectId);
    const projectSettings = dataSnapshot.projectSettings.get(projectId);

    // Chapter
    const chapter = chapterId ? dataSnapshot.chapters.get(chapterId) : undefined;

    // Timelines for chapter
    const timelines = chapterId
      ? Array.from(dataSnapshot.timelines.values())
          .filter((t) => t.chapterId === chapterId)
          .map((t) => ({
            id: t.id,
            type: t.type,
            label: t.label,
            orderIndex: t.orderIndex,
          }))
      : [];

    // Blocks for timelines
    const timelineIds = new Set(timelines.map((t) => t.id));
    const blocks = Array.from(dataSnapshot.blocks.values())
      .filter((b) => timelineIds.has(b.timelineId))
      .map((b) => ({
        id: b.id,
        timelineId: b.timelineId,
        blockType: b.blockType,
        timelineOffsetInFrames: b.timelineOffsetInFrames,
        durationInFrames: b.fileRelativeEndFrame - b.fileRelativeStartFrame,
        mediaAssetId: b.mediaAssetId,
        settings: b.blockSettings || {},
      }));

    // Media assets for project
    const mediaAssets = Array.from(dataSnapshot.mediaAssets.values())
      .filter((a) => a.projectId === projectId)
      .map((a) => ({
        id: a.id,
        mediaType: a.mediaType,
        fileName: a.fileName,
        metadata: {
          sourceDurationInFrames: a.metadata?.sourceDurationInFrames,
          sourceFps: a.metadata?.sourceFps,
          width: a.metadata?.width,
          height: a.metadata?.height,
        },
      }));

    return {
      project: {
        id: project?.id || projectId,
        name: project?.name || 'Unknown',
        settings: {
          fps: parseInt(projectSettings?.get('project.fps') || '30'),
          workspaceWidth: parseInt(projectSettings?.get('export.resolution.width') || '1920'),
          workspaceHeight: parseInt(projectSettings?.get('export.resolution.height') || '1080'),
          ...Object.fromEntries(projectSettings || []),
        },
      },
      chapter: chapter
        ? {
            id: chapter.id,
            title: chapter.title,
            templateId: chapter.templateId,
          }
        : undefined,
      timelines,
      blocks,
      mediaAssets,
    };
  }
}

// Singleton
let instance: ConfigSnapshotCollector | null = null;

export function getConfigSnapshotCollector(): ConfigSnapshotCollector {
  if (!instance) {
    instance = new ConfigSnapshotCollector();
  }
  return instance;
}
