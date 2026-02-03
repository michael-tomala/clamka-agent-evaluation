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
import type { CancelToken } from '../../../electron/services/agents/BaseAgentService';
import { storageRegistry } from '../../../shared/storage';
import { promptLoaderService } from '../../../electron/services/base/PromptLoaderService';
import { agentPromptService } from '../../../electron/services/base/AgentPromptService';
import { JsonStorage } from '../storage/json-storage';
import { ToolTracker } from './tool-tracker';
import { getToolDefinitionsForAgent } from './tool-definitions-provider';
import type { ITestableAgent } from './test-harness';
import type { ChatMessage, Project, Chapter } from '../../../shared/types';
import type { ToolWrapper, TransAgentPromptConfig } from '../../../electron/services/mcp/types';
import type { SystemPromptConfig, RawMessage, ContentBlock, ScenarioInputContext, SubagentPromptConfig } from '../types/scenario';

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
  /** Custom opisy narzędzi (nadpisują domyślne) */
  toolDescriptions?: Record<string, string>;
  /** Custom opisy parametrów narzędzi (nadpisują domyślne) */
  toolParameterDescriptions?: Record<string, Record<string, string>>;
  /** Custom prompty dla trans agentów (klucz = typ np. 'media-scout') */
  transAgentPrompts?: Record<string, TransAgentPromptConfig>;
  /** Włączone narzędzia dla trans agentów (klucz = typ trans agenta, wartość = lista nazw narzędzi) */
  transAgentEnabledTools?: Record<string, string[]>;
  /**
   * Custom konfiguracja subagentów (Task tool)
   * Klucz = typ subagenta (np. 'chapter-explorator', 'web-researcher', 'script-segments-editor')
   */
  subagentPrompts?: Record<string, SubagentPromptConfig>;
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

  // Zebrane logi stderr z Claude CLI (dla diagnostyki)
  private collectedStderrLogs: string[] = [];

  // Callback do emitowania wiadomości w czasie rzeczywistym
  private onMessageCallback?: (message: RawMessage) => void;

  // Akumulatory tokenów - do użycia przy timeout (partial metrics)
  private accumulatedInputTokens = 0;
  private accumulatedOutputTokens = 0;

  // Token do anulowania agenta (używany przy timeout)
  private cancelToken: CancelToken = { cancelled: false };

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
      const { MONTAGE_ALLOWED_TOOLS, SCRIPT_ALLOWED_TOOLS, isSdkBuiltinTool } = require('../../../shared/prompts/agents/allowed-tools');
      const allTools = this.agentType === 'montage' ? MONTAGE_ALLOWED_TOOLS : SCRIPT_ALLOWED_TOOLS;

      // Wyciąg nazwy - obsłuż zarówno MCP (z prefiksem) jak i SDK (bez prefiksu)
      const allToolNames = allTools.map((t: string) => {
        if (t.startsWith('mcp__clamka-mcp__')) {
          return t.replace('mcp__clamka-mcp__', '');
        }
        if (t.startsWith('mcp__mcp-puppeteer__')) {
          return t.replace('mcp__mcp-puppeteer__', '');
        }
        // SDK built-in tools (Task, TodoWrite, etc.) - bez prefiksu, zachowaj jak jest
        if (isSdkBuiltinTool(t)) {
          return t;
        }
        return t;
      });

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
    // Reset zebranych wiadomości, logów stderr, akumulatorów tokenów i cancel token na początku nowej konwersacji
    this.collectedMessages = [];
    this.collectedStderrLogs = [];
    this.accumulatedInputTokens = 0;
    this.accumulatedOutputTokens = 0;
    this.cancelToken = { cancelled: false };
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

    // Pobierz definicje narzędzi i nadpisz opisy jeśli podane w konfiguracji
    let toolDefs = getToolDefinitionsForAgent(this.agentType, enabledToolsForAgent);

    // Nadpisz opisy narzędzi jeśli podane w konfiguracji
    if (this.toolsConfig?.toolDescriptions) {
      toolDefs = toolDefs.map(def => ({
        ...def,
        description: this.toolsConfig!.toolDescriptions![def.name] ?? def.description
      }));
    }

    // Nadpisz opisy parametrów jeśli podane
    if (this.toolsConfig?.toolParameterDescriptions) {
      toolDefs = toolDefs.map(def => {
        const paramOverrides = this.toolsConfig!.toolParameterDescriptions![def.name];
        if (!paramOverrides || !def.parameters) return def;

        return {
          ...def,
          parameters: def.parameters.map(param => ({
            ...param,
            description: paramOverrides[param.name] ?? param.description
          }))
        };
      });
    }

    // Dodaj informację o narzędziach na początku stderr logs
    this.collectedStderrLogs.push(`[Config] Tools (${toolDefs.length}):`);
    for (const tool of toolDefs) {
      this.collectedStderrLogs.push(`  - ${tool.name}: ${tool.description}`);
      for (const param of tool.parameters) {
        const reqMark = param.required ? '*' : '';
        this.collectedStderrLogs.push(`      ${param.name}${reqMark} (${param.type}): ${param.description}`);
      }
    }

    let result: ChatMessage | null = null;
    let turnCount = 0;

    // Callback do śledzenia tool calls i zbierania wiadomości
    const onMessageInternal = (msg: {
      type: string;
      message: Record<string, unknown>;
      parent_tool_use_id?: string; // SDK przesyła to pole dla wiadomości trans agentów
    }) => {
      // SDK zwraca różne struktury:
      // - Główny agent: { message: { message: { content: [...] } } }
      // - Trans agent: { message: { content: [...] }, parent_tool_use_id: "..." }
      const nestedMsgContent = msg.message?.message as Record<string, unknown> | undefined;
      const directContent = msg.message?.content as Array<Record<string, unknown>> | undefined;
      const content = (nestedMsgContent?.content || directContent) as Array<Record<string, unknown>> | undefined;

      // Zbierz KAŻDĄ wiadomość do collectedMessages
      if (Array.isArray(content) && content.length > 0) {
        const normalizedContent = content.map((block) => this.normalizeContentBlock(block));
        const rawMessage: RawMessage = {
          role: msg.type as 'user' | 'assistant' | 'system',
          timestamp: Date.now(),
          content: normalizedContent,
          parentToolUseId: msg.parent_tool_use_id, // Przechwycenie ID parenta dla trans agentów
        };
        this.collectedMessages.push(rawMessage);

        // Akumuluj tokeny (estymacja: ~2 tokeny na znak)
        const textLength = this.estimateTextLength(normalizedContent);
        if (msg.type === 'user') {
          this.accumulatedInputTokens += textLength * 2;
        } else if (msg.type === 'assistant') {
          this.accumulatedOutputTokens += textLength * 2;
        }

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

      // Dla montage agent - użyj buildFullResolveContext dla pełnego zestawu placeholderów
      if (this.agentType === 'montage' && project && chapter) {
        const montageAgent = this.agent as MontageAgentService;
        const fullContext = montageAgent.buildFullResolveContext(
          typedContext.projectId,
          typedContext.chapterId,
          project,
          chapter
        );
        // Nadpisz FPS jeśli customFps podane
        if (inputContext.customFps) {
          fullContext.fps = inputContext.customFps;
        }
        this.resolvedPromptInfo.resolvedPrompt = agentPromptService.resolveAllPlaceholders(
          this.resolvedPromptInfo.rawPrompt,
          fullContext
        );
        console.log(`[TestableAgentAdapter] Resolved all placeholders for Montage agent`);
      } else {
        // Dla innych agentów - użyj podstawowego kontekstu
        this.resolvedPromptInfo.resolvedPrompt = agentPromptService.resolveAllPlaceholders(
          this.resolvedPromptInfo.rawPrompt,
          {
            ...resolveContext,
            projectContext: project?.projectSettings?.['project.context'] as string || 'Brak opisu',
          }
        );
        console.log(`[TestableAgentAdapter] Resolved placeholders for: ${this.agentType}`);
      }
    }

    // Pobierz custom prompt (jeśli ustawiony) - preferuj rozwiązany prompt
    const customPrompt = this.resolvedPromptInfo?.resolvedPrompt || this.resolvedPromptInfo?.rawPrompt;

    // Pobierz mode z resolved prompt info (domyślnie 'append')
    const promptMode = this.resolvedPromptInfo?.mode;

    // Callback dla zbierania logów stderr z Claude CLI
    const stderrCallback = (message: string) => {
      this.collectedStderrLogs.push(message);
    };

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
        this.cancelToken, // cancelToken - do anulowania przy timeout
        undefined, // sender
        inputContext.contextRefs, // contextRefs - referencje kontekstowe z scenariusza
        undefined, // images
        this.toolWrapper, // toolWrapper dla precyzyjnego śledzenia
        customPrompt, // customSystemPrompt (nadpisuje domyślny)
        promptMode, // systemPromptMode: 'append' lub 'replace'
        enabledToolsForAgent, // lista dozwolonych narzędzi (dla testów)
        stderrCallback, // callback dla logów stderr z Claude CLI
        this.toolsConfig?.transAgentPrompts, // custom prompty dla trans agentów
        this.toolsConfig?.transAgentEnabledTools, // włączone narzędzia dla trans agentów
        this.toolsConfig?.subagentPrompts // custom konfiguracja subagentów (Task tool)
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
        this.cancelToken, // cancelToken - do anulowania przy timeout
        undefined, // sender
        inputContext.contextRefs, // contextRefs - referencje kontekstowe z scenariusza
        undefined, // images
        this.toolWrapper, // toolWrapper dla precyzyjnego śledzenia
        customPrompt, // customSystemPrompt (nadpisuje domyślny)
        promptMode, // systemPromptMode: 'append' lub 'replace'
        enabledToolsForAgent, // lista dozwolonych narzędzi (dla testów)
        stderrCallback, // callback dla logów stderr z Claude CLI
        this.toolsConfig?.transAgentPrompts, // custom prompty dla trans agentów
        this.toolsConfig?.transAgentEnabledTools, // włączone narzędzia dla trans agentów
        this.toolsConfig?.subagentPrompts // custom konfiguracja subagentów (Task tool)
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
   * Estymuje długość tekstu z content blocks (dla szacowania tokenów)
   */
  private estimateTextLength(content: ContentBlock[]): number {
    let length = 0;
    for (const block of content) {
      if (block.type === 'text') {
        length += block.text.length;
      } else if (block.type === 'tool_use') {
        length += JSON.stringify(block.input).length;
      } else if (block.type === 'tool_result') {
        length += typeof block.content === 'string'
          ? block.content.length
          : JSON.stringify(block.content).length;
      } else if (block.type === 'thinking') {
        length += block.thinking.length;
      }
    }
    return length;
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
   * Zwraca częściowe metryki (dla partial results przy timeout)
   * Używane gdy scenariusz kończy się timeout'em, ale agent już przetworzył część zapytania
   */
  getPartialMetrics(): { inputTokens: number; outputTokens: number; turnCount: number } {
    return {
      inputTokens: this.accumulatedInputTokens,
      outputTokens: this.accumulatedOutputTokens,
      turnCount: this.collectedMessages.filter((m) => m.role === 'assistant').length,
    };
  }

  /**
   * Zwraca zebrane wiadomości z konwersacji (dla partial results przy timeout)
   */
  getCollectedMessages(): RawMessage[] {
    return this.collectedMessages;
  }

  /**
   * Zwraca zebrane logi stderr z Claude CLI (dla diagnostyki testów)
   */
  getCollectedStderrLogs(): string[] {
    return this.collectedStderrLogs;
  }

  /**
   * Anuluje bieżącą operację agenta.
   * Używane przy timeout aby zatrzymać agenta i zapobiec dalszym wywołaniom API.
   */
  cancel(): void {
    this.cancelToken.cancelled = true;
    console.log('[TestableAgentAdapter] Agent cancelled');
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
