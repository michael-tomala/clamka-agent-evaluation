/**
 * TestableAgentAdapter - adapter łączący prawdziwych agentów z test harness
 *
 * Wstrzykuje JsonStorage do electron's StorageRegistry, dzięki czemu
 * serwisy bazowe (BlockService, ChapterService, etc.) używają in-memory storage
 * zamiast SQLite.
 *
 * Wstrzykuje toolWrapper do context agenta, dzięki czemu wszystkie tool calls
 * są precyzyjnie śledzone (input, output, timing).
 *
 * Wspiera custom system prompts dla testowania różnych wariantów promptów.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MontageAgentService } from '../../../electron/services/agents/MontageAgentService';
import { ScriptAgentService } from '../../../electron/services/agents/ScriptAgentService';
import { storageRegistry } from '../../../shared/storage';
import { promptLoaderService } from '../../../electron/services/base/PromptLoaderService';
import { agentPromptService } from '../../../electron/services/base/AgentPromptService';
import { JsonStorage } from '../storage/json-storage';
import { ToolTracker } from './tool-tracker';
import type { ITestableAgent } from './test-harness';
import type { ChatMessage, Project, Chapter } from '../../../shared/types';
import type { ToolWrapper } from '../../../electron/services/mcp/types';
import type { SystemPromptConfig, RawMessage, ContentBlock, ScenarioInputContext } from '../types/scenario';

export type AgentType = 'montage' | 'script';

export interface TestableAgentContext {
  projectId: string;
  chapterId: string;
  toolWrapper?: ToolWrapper;
  customSystemPrompt?: string;
  /**
   * Tryb aplikacji system prompt:
   * - 'append' (domyślny) - dodaje customSystemPrompt do claude_code
   * - 'replace' - używa tylko customSystemPrompt (bez claude_code)
   */
  systemPromptMode?: 'append' | 'replace';
  [key: string]: unknown;
}

export interface TestableAgentToolsConfig {
  /** Lista włączonych narzędzi (null = wszystkie dozwolone dla agenta) */
  enabledTools?: string[];
  /** Lista wyłączonych narzędzi (alternatywa do enabledTools) */
  disabledTools?: string[];
}

/**
 * Informacja o rozwiązanym prompcie (do zapisania w ConfigSnapshot)
 */
export interface ResolvedPromptInfo {
  source: 'default' | 'custom-raw' | 'custom-file' | 'patched';
  sourceFile?: string;
  patches?: { find: string; replace: string }[];
  rawPrompt: string;
  /**
   * Przetworzony prompt z rozwiązanymi placeholderami ({{...}})
   * Ustawiany w metodzie chat() gdy znamy pełny kontekst (projectId, chapterId, fps, etc.)
   */
  resolvedPrompt?: string;
  /**
   * Tryb aplikacji system prompt:
   * - 'append' (domyślny) - dodaje do claude_code
   * - 'replace' - zastępuje claude_code
   */
  mode?: 'append' | 'replace';
}

/**
 * Adapter łączący MontageAgentService/ScriptAgentService z ITestableAgent
 *
 * Umożliwia testowanie prawdziwych agentów z JsonStorage zamiast SQLite.
 * Wstrzykuje toolWrapper do context agenta dla precyzyjnego śledzenia tool calls.
 * Wspiera custom system prompts dla testowania różnych wariantów promptów.
 */
export class TestableAgentAdapter implements ITestableAgent {
  public readonly name: string;
  private agent: MontageAgentService | ScriptAgentService;
  private agentType: AgentType;
  private jsonStorage: JsonStorage;
  private tracker: ToolTracker;

  // Wrapper przekazywany do agenta - śledzi wszystkie tool calls z precyzyjnym timingiem
  private toolWrapper: ToolWrapper;

  // Legacy - zachowane dla kompatybilności z getTools()/setTools()
  private trackedTools: Record<string, (...args: unknown[]) => unknown> = {};

  // Informacja o custom prompcie (jeśli ustawiony)
  private customPromptConfig?: SystemPromptConfig;
  private resolvedPromptInfo?: ResolvedPromptInfo;

  // Konfiguracja narzędzi (enabledTools/disabledTools)
  private toolsConfig?: TestableAgentToolsConfig;

  // Zebrane wiadomości z konwersacji (dla live streaming)
  private collectedMessages: RawMessage[] = [];

  // Callback do emitowania wiadomości w czasie rzeczywistym
  private onMessageCallback?: (message: RawMessage) => void;

  constructor(
    agentType: AgentType,
    storage: JsonStorage,
    tracker: ToolTracker,
    customPromptConfig?: SystemPromptConfig,
    toolsConfig?: TestableAgentToolsConfig
  ) {
    this.agentType = agentType;
    this.jsonStorage = storage;
    this.tracker = tracker;
    this.name = agentType === 'montage' ? 'MontageAgent' : 'ScriptAgent';
    this.customPromptConfig = customPromptConfig;
    this.toolsConfig = toolsConfig;

    // 0. Rozwiąż system prompt (custom lub domyślny)
    // Diagnostyka - do usunięcia po zdiagnozowaniu problemu
    console.log('[TestableAgentAdapter] customPromptConfig received:', customPromptConfig ? 'YES' : 'NO');
    if (customPromptConfig) {
      console.log('[TestableAgentAdapter] config.raw length:', customPromptConfig.raw?.length);
      console.log('[TestableAgentAdapter] config.mode:', customPromptConfig.mode);
    }

    if (customPromptConfig) {
      this.resolvedPromptInfo = this.resolveSystemPrompt(customPromptConfig);
      console.log(`[TestableAgentAdapter] Custom prompt source: ${this.resolvedPromptInfo.source}`);
    } else {
      // Dla domyślnego promptu też wypełnij resolvedPromptInfo
      const defaultPrompt = promptLoaderService.getAgentPrompt(this.agentType);
      if (defaultPrompt) {
        this.resolvedPromptInfo = {
          source: 'default',
          sourceFile: `shared/prompts/agents/${this.agentType}.md`,
          rawPrompt: defaultPrompt,
        };
        console.log(`[TestableAgentAdapter] Using default prompt for: ${this.agentType}`);
      }
    }

    // 1. Wstrzyknij JsonStorage do electron's StorageRegistry
    // Od teraz wszystkie serwisy (BlockService, etc.) używają JsonStorage
    storageRegistry.setAll({
      project: storage.getProjectStorage(),
      chapter: storage.getChapterStorage(),
      timeline: storage.getTimelineStorage(),
      block: storage.getBlockStorage(),
      mediaAsset: storage.getMediaAssetStorage(),
      chat: storage.getChatStorage(),
      enrichment: storage.getEnrichmentStorage(),
      settings: storage.getSettingsStorage(),
      person: storage.getPersonStorage(),
      dynamicComposition: storage.getDynamicCompositionStorage(),
    });

    // Weryfikacja że storage został ustawiony
    if (!storageRegistry.isInitialized()) {
      console.error('[TestableAgentAdapter] CRITICAL: Storage not initialized after setAll()!');
      console.error('[TestableAgentAdapter] This may indicate module resolution issue.');
      console.error('[TestableAgentAdapter] storageRegistry instance:', storageRegistry);
      throw new Error('StorageRegistry initialization failed - possible module singleton mismatch');
    }
    console.log('[TestableAgentAdapter] StorageRegistry initialized successfully');

    // 2. Utwórz toolWrapper do precyzyjnego śledzenia tool calls
    this.toolWrapper = this.createToolWrapper();

    // 3. Utwórz agenta (używa registry z JsonStorage)
    if (agentType === 'montage') {
      this.agent = new MontageAgentService();
    } else {
      this.agent = new ScriptAgentService();
    }
  }

  /**
   * Rozwiązuje custom system prompt na podstawie konfiguracji
   */
  private resolveSystemPrompt(config: SystemPromptConfig): ResolvedPromptInfo {
    // Opcja 1: Pełny tekst promptu
    if (config.raw) {
      return {
        source: 'custom-raw',
        rawPrompt: config.raw,
        mode: config.mode,
      };
    }

    // Opcja 2: Prompt z pliku
    if (config.file) {
      const filePath = path.resolve(process.cwd(), config.file);
      if (!fs.existsSync(filePath)) {
        throw new Error(`[TestableAgentAdapter] Custom prompt file not found: ${filePath}`);
      }
      const fileContent = fs.readFileSync(filePath, 'utf-8');
      return {
        source: 'custom-file',
        sourceFile: config.file,
        rawPrompt: fileContent,
        mode: config.mode,
      };
    }

    // Opcja 3: Patche na domyślny prompt
    if (config.patches && config.patches.length > 0) {
      let prompt = promptLoaderService.getAgentPrompt(this.agentType);
      if (!prompt) {
        throw new Error(`[TestableAgentAdapter] Default prompt not found for agent: ${this.agentType}`);
      }

      for (const patch of config.patches) {
        prompt = prompt.replace(patch.find, patch.replace);
      }

      return {
        source: 'patched',
        patches: config.patches,
        rawPrompt: prompt,
        mode: config.mode,
      };
    }

    // Fallback - domyślny prompt
    const defaultPrompt = promptLoaderService.getAgentPrompt(this.agentType);
    if (!defaultPrompt) {
      throw new Error(`[TestableAgentAdapter] Default prompt not found for agent: ${this.agentType}`);
    }
    return {
      source: 'default',
      sourceFile: `shared/prompts/agents/${this.agentType}.md`,
      rawPrompt: defaultPrompt,
      mode: config.mode,
    };
  }

  /**
   * Zwraca informacje o rozwiązanym prompcie (do zapisania w ConfigSnapshot)
   */
  getResolvedPromptInfo(): ResolvedPromptInfo | undefined {
    return this.resolvedPromptInfo;
  }

  /**
   * Wylicza finalną listę włączonych narzędzi na podstawie konfiguracji
   * Zwraca undefined jeśli nie ma żadnych filtrów (wszystkie narzędzia włączone)
   */
  private computeEnabledTools(): string[] | undefined {
    if (!this.toolsConfig) {
      return undefined;
    }

    const { enabledTools, disabledTools } = this.toolsConfig;

    // Jeśli podano enabledTools, użyj ich bezpośrednio
    if (enabledTools && enabledTools.length > 0) {
      console.log(`[TestableAgentAdapter] Using ${enabledTools.length} enabled tools`);
      return enabledTools;
    }

    // Jeśli podano disabledTools, pobierz wszystkie dozwolone dla agenta i odejmij wyłączone
    if (disabledTools && disabledTools.length > 0) {
      // Import dynamiczny żeby uniknąć circular dependency
      const { MONTAGE_ALLOWED_TOOLS, SCRIPT_ALLOWED_TOOLS } = require('../../../shared/prompts/agents/allowed-tools');
      const allTools = this.agentType === 'montage' ? MONTAGE_ALLOWED_TOOLS : SCRIPT_ALLOWED_TOOLS;

      // Wyciąg nazwy bez prefiksu mcp__clamka-mcp__
      const allToolNames = allTools
        .filter((t: string) => t.startsWith('mcp__clamka-mcp__'))
        .map((t: string) => t.replace('mcp__clamka-mcp__', ''));

      const filteredTools = allToolNames.filter((t: string) => !disabledTools.includes(t));
      console.log(`[TestableAgentAdapter] Using ${filteredTools.length} tools (${disabledTools.length} disabled)`);
      return filteredTools;
    }

    return undefined;
  }

  /**
   * Tworzy wrapper dla narzędzi MCP który śledzi wywołania z precyzyjnym timingiem
   */
  private createToolWrapper(): ToolWrapper {
    return <TInput, TOutput>(
      toolName: string,
      handler: (input: TInput) => TOutput | Promise<TOutput>
    ) => {
      return async (input: TInput): Promise<TOutput> => {
        const startTime = Date.now();
        try {
          const result = await Promise.resolve(handler(input));
          const durationMs = Date.now() - startTime;

          // Record call z pełnymi danymi (input, output, timing)
          this.tracker.recordCall(
            toolName,
            input as Record<string, unknown>,
            result as Record<string, unknown>,
            startTime,
            durationMs
          );

          return result;
        } catch (error) {
          const durationMs = Date.now() - startTime;

          // Record błędu
          this.tracker.recordCall(
            toolName,
            input as Record<string, unknown>,
            { error: error instanceof Error ? error.message : String(error) },
            startTime,
            durationMs
          );

          throw error;
        }
      };
    };
  }

  /**
   * Wysyła wiadomość do agenta i czeka na odpowiedź
   */
  async chat(
    threadId: string,
    message: string,
    options: {
      model?: string;
      thinkingMode?: 'think' | 'hard' | 'harder' | 'ultrathink';
    },
    context?: Record<string, unknown>,
    onMessage?: (message: RawMessage) => void
  ): Promise<{
    response: string;
    metrics: {
      inputTokens: number;
      outputTokens: number;
      turnCount: number;
    };
    messages: RawMessage[];
  }> {
    // Reset zebranych wiadomości na początku nowej konwersacji
    this.collectedMessages = [];
    this.onMessageCallback = onMessage;
    const typedContext = context as TestableAgentContext | undefined;

    if (!typedContext?.projectId || !typedContext?.chapterId) {
      throw new Error('TestableAgentAdapter requires projectId and chapterId in context');
    }

    // Cast do pełnego typu kontekstu scenariusza (z contextRefs, customFps, etc.)
    const inputContext = typedContext as ScenarioInputContext;

    const model = (options.model || 'sonnet') as 'haiku' | 'sonnet' | 'opus';
    const thinkingMode = (options.thinkingMode || 'think') as 'think' | 'hard' | 'harder' | 'ultrathink';

    // Przygotuj konfigurację narzędzi - wylicz finalną listę enabled tools
    const enabledToolsForAgent = this.computeEnabledTools();

    let result: ChatMessage | null = null;
    let turnCount = 0;

    // Callback do śledzenia tool calls i zbierania wiadomości
    const onMessageInternal = (msg: { type: string; message: Record<string, unknown> }) => {
      // SDK zwraca strukturę: { message: { content: [...] } }
      const msgContent = msg.message?.message as Record<string, unknown> | undefined;
      const content = msgContent?.content as Array<Record<string, unknown>> | undefined;

      // Zbierz KAŻDĄ wiadomość do collectedMessages
      if (Array.isArray(content) && content.length > 0) {
        const rawMessage: RawMessage = {
          role: msg.type as 'user' | 'assistant',
          timestamp: Date.now(),
          content: content.map((block) => this.normalizeContentBlock(block)),
        };
        this.collectedMessages.push(rawMessage);

        // Wywołaj callback dla live streaming
        if (this.onMessageCallback) {
          this.onMessageCallback(rawMessage);
        }
      }

      // Zliczanie turnów (tool calls są logowane przez toolWrapper z pełnymi danymi)
      if (msg.type === 'assistant') {
        turnCount++;
      }

      // Tool results
      if (msg.type === 'user') {
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'tool_result') {
              // Aktualizuj ostatni tool call z wynikiem
              const calls = this.tracker.getCalls();
              const lastCall = calls[calls.length - 1];
              if (lastCall && block.tool_use_id) {
                // Zaktualizuj wynik w trackerze
                lastCall.output = block.content;
              }
            }
          }
        }
      }
    };

    // Rozwiąż placeholdery w prompcie jeśli jeszcze nie rozwiązane
    if (this.resolvedPromptInfo && !this.resolvedPromptInfo.resolvedPrompt) {
      // Pobierz dane projektu i chaptera dla kontekstu placeholderów
      const project = this.jsonStorage.getProjectStorage().findById(typedContext.projectId);
      const chapter = this.jsonStorage.getChapterStorage().findById(typedContext.chapterId);

      // FPS i inne settings są w projectSettings, nie bezpośrednio na project
      const projectSettings = project?.projectSettings || {};

      const resolveContext = {
        projectId: typedContext.projectId,
        chapterId: typedContext.chapterId,
        projectName: project?.name,
        // customFps pozwala nadpisać FPS (np. dla edge cases), w przeciwnym razie z settings
        fps: inputContext.customFps ?? parseInt(String(projectSettings['project.fps']) || '30'),
        chapterTitle: chapter?.title,
        templateId: chapter?.templateId,
        workspaceWidth: parseInt(String(projectSettings['export.resolution.width']) || '1920'),
        workspaceHeight: parseInt(String(projectSettings['export.resolution.height']) || '1080'),
      };

      this.resolvedPromptInfo.resolvedPrompt = agentPromptService.resolvePromptPlaceholders(
        this.agentType,
        this.resolvedPromptInfo.rawPrompt,
        resolveContext
      );
      console.log(`[TestableAgentAdapter] Resolved base placeholders in prompt for: ${this.agentType}`);

      // Dla montage agent - rozwiąż dodatkowe placeholdery specyficzne dla montażu
      // ({{timelinesSnapshot}}, {{projectContext}}, {{mediaPoolTotal}}, etc.)
      if (this.agentType === 'montage' && project && chapter) {
        const montageAgent = this.agent as MontageAgentService;
        this.resolvedPromptInfo.resolvedPrompt = montageAgent.resolveMontagePlaceholders(
          this.resolvedPromptInfo.resolvedPrompt,
          typedContext.projectId,
          typedContext.chapterId,
          project,
          chapter
        );
        console.log(`[TestableAgentAdapter] Resolved Montage-specific placeholders (timelinesSnapshot, etc.)`);
      }
    }

    // Pobierz custom prompt (jeśli ustawiony) - preferuj rozwiązany prompt
    const customPrompt = this.resolvedPromptInfo?.resolvedPrompt || this.resolvedPromptInfo?.rawPrompt;

    // Pobierz mode z resolved prompt info (domyślnie 'append')
    const promptMode = this.resolvedPromptInfo?.mode;

    // Wywołaj odpowiednią metodę agenta z toolWrapper i customSystemPrompt
    if (this.agentType === 'montage') {
      const montageAgent = this.agent as MontageAgentService;
      result = await montageAgent.chatWithMontage(
        typedContext.projectId,
        typedContext.chapterId,
        threadId,
        message,
        model,
        thinkingMode,
        onMessageInternal,
        undefined, // cancelToken
        undefined, // sender
        inputContext.contextRefs, // contextRefs - referencje kontekstowe z scenariusza
        undefined, // images
        this.toolWrapper, // toolWrapper dla precyzyjnego śledzenia
        customPrompt, // customSystemPrompt (nadpisuje domyślny)
        promptMode, // systemPromptMode: 'append' lub 'replace'
        enabledToolsForAgent // lista dozwolonych narzędzi (dla testów)
      );
    } else {
      const scriptAgent = this.agent as ScriptAgentService;
      // ScriptAgentService.chatWithScript ma inną sygnaturę - chapterId jest po thinkingMode
      result = await scriptAgent.chatWithScript(
        typedContext.projectId,
        threadId,
        message,
        model,
        thinkingMode,
        typedContext.chapterId, // optional chapterId
        onMessageInternal,
        undefined, // cancelToken
        undefined, // sender
        inputContext.contextRefs, // contextRefs - referencje kontekstowe z scenariusza
        undefined, // images
        this.toolWrapper, // toolWrapper dla precyzyjnego śledzenia
        customPrompt, // customSystemPrompt (nadpisuje domyślny)
        promptMode, // systemPromptMode: 'append' lub 'replace'
        enabledToolsForAgent // lista dozwolonych narzędzi (dla testów)
      );
    }

    // Wyciągnij response z last message
    let responseText = '';
    if (result) {
      const content = (result.object as Record<string, unknown>)?.message as Record<string, unknown>;
      const contentBlocks = content?.content as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(contentBlocks)) {
        for (const block of contentBlocks) {
          if (block.type === 'text') {
            responseText += block.text as string;
          }
        }
      }
    }

    // TODO: Uzyskać prawdziwe metryki tokenów z SDK
    // Na razie zwracamy szacunkowe wartości
    return {
      response: responseText,
      metrics: {
        inputTokens: message.length * 2, // Estimate
        outputTokens: responseText.length * 2, // Estimate
        turnCount,
      },
      messages: this.collectedMessages,
    };
  }

  /**
   * Normalizuje blok zawartości do typu ContentBlock
   */
  private normalizeContentBlock(block: Record<string, unknown>): ContentBlock {
    switch (block.type) {
      case 'text':
        return { type: 'text', text: block.text as string };
      case 'tool_use':
        return {
          type: 'tool_use',
          id: block.id as string,
          name: block.name as string,
          input: block.input as Record<string, unknown>,
        };
      case 'tool_result':
        return {
          type: 'tool_result',
          tool_use_id: block.tool_use_id as string,
          content: block.content,
          is_error: block.is_error as boolean | undefined,
        };
      case 'thinking':
        return { type: 'thinking', thinking: block.thinking as string };
      default:
        return { type: 'text', text: JSON.stringify(block) };
    }
  }

  /**
   * Zwraca narzędzia agenta
   *
   * UWAGA: MCP tools są tworzone wewnętrznie przez agentów
   * i nie są bezpośrednio dostępne. Zwracamy puste obiekty.
   */
  getTools(): Record<string, (...args: unknown[]) => unknown> {
    return this.trackedTools;
  }

  /**
   * Ustawia opakowane narzędzia
   *
   * UWAGA: MCP tools są tworzone wewnętrznie przez agentów
   * więc ta metoda ma ograniczone zastosowanie.
   */
  setTools(tools: Record<string, (...args: unknown[]) => unknown>): void {
    this.trackedTools = tools;
  }

  /**
   * Zwraca zebrane wiadomości z konwersacji (dla partial results przy timeout)
   */
  getCollectedMessages(): RawMessage[] {
    return this.collectedMessages;
  }

  /**
   * Przywraca domyślne storage (SQLite) w registry
   * KRYTYCZNE: Musi być wywołane po zakończeniu testu!
   */
  cleanup(): void {
    storageRegistry.resetToDefaults();
  }

  /**
   * Zwraca bieżący JsonStorage
   */
  getStorage(): JsonStorage {
    return this.jsonStorage;
  }
}
