/**
 * ClaudeVisionTestService - Serwis do testowania pipeline'u Claude Vision
 *
 * Orchestruje: sprite generation + Claude Vision query
 * dla potrzeb testing dashboard (zakładka "Claude Vision - Scenes")
 */

import * as fs from 'fs';
import * as fsPromises from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { FFmpegCliService, VideoMetadata } from '../../../desktop-app/electron/services/cli/FFmpegCliService';
import { ClaudeCodeCLIService } from '../../../desktop-app/electron/services/cli/ClaudeCodeCLIService';
import { promptLoaderService } from '../../../desktop-app/electron/services/base/PromptLoaderService';
import { SceneDescription, SceneActionTuple, SceneActionWithSourceFrames } from '../../../desktop-app/shared/types';
import { convertSpriteActionsToSourceFrames } from '../../../desktop-app/shared/types/sprite';

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeVisionTestRequest {
  videoPath: string;
  prompt?: string;        // custom prompt (null = default)
  model?: string;         // haiku | sonnet | opus
  frameWidth?: number;    // domyślnie 240
  maxFrames?: number;     // max klatek w sprite sheet (domyślnie 20)
  systemPrompt?: string;              // treść system promptu
  systemPromptMode?: 'append' | 'replace';  // tryb (domyślnie append)
}

interface SpriteSheetInfo {
  base64: string;
  cols: number;
  rows: number;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  /** Co ile klatek źródłowych jest klatka w sprite */
  frameInterval: number;
}

interface RawMessage {
  role: 'user' | 'assistant';
  timestamp: number;
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  >;
}

export interface ClaudeVisionTestResponse {
  messages: RawMessage[];
  spriteSheet: SpriteSheetInfo;
  videoMetadata: { width: number; height: number; fps: number; duration: number; frameCount: number };
  parsed: SceneDescription | null;
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
  /** Akcje z przeliczonymi source frames (jeśli actions w formacie tuple) */
  actionsWithSourceFrames?: SceneActionWithSourceFrames[];
}

// ============================================================================
// SPRITE LAYOUT CONFIG (z ClaudeVisionAnalysisService)
// ============================================================================

const SCENE_SPRITE_CONFIG = {
  maxFrames: 100,
  frameWidth: 240,
  quality: 2,
  preferredLayouts: [
    { cols: 10, rows: 10, capacity: 100 },
    { cols: 10, rows: 8, capacity: 80 },
    { cols: 10, rows: 6, capacity: 60 },
    { cols: 8, rows: 5, capacity: 40 },
    { cols: 6, rows: 5, capacity: 30 },
    { cols: 5, rows: 4, capacity: 20 },
    { cols: 4, rows: 4, capacity: 16 },
    { cols: 4, rows: 3, capacity: 12 },
    { cols: 3, rows: 3, capacity: 9 },
    { cols: 3, rows: 2, capacity: 6 },
    { cols: 2, rows: 2, capacity: 4 },
  ],
};

// ============================================================================
// SERVICE
// ============================================================================

class ClaudeVisionTestService {
  private ffmpegCLI: FFmpegCliService;
  private claudeCLI: ClaudeCodeCLIService;

  constructor() {
    this.ffmpegCLI = new FFmpegCliService();
    this.claudeCLI = new ClaudeCodeCLIService();
  }

  /**
   * Zwraca domyślny user message używany do analizy scen
   * (tylko userMessage z pliku .md, bez system promptu)
   */
  getDefaultPrompt(): string {
    const visionPrompts = promptLoaderService.getVisionPrompt('scene-analysis');
    if (!visionPrompts) {
      return '[Błąd: brak pliku prompts/vision/scene-analysis.md]';
    }
    return visionPrompts.userMessage;
  }

  /**
   * Zwraca domyślny system prompt używany do analizy scen
   * (systemPrompt z pliku .md, z placeholderem {{projectContext}} do ręcznej edycji)
   */
  getDefaultSystemPrompt(): string {
    const visionPrompts = promptLoaderService.getVisionPrompt('scene-analysis');
    if (!visionPrompts) {
      return '';
    }
    return visionPrompts.systemPrompt;
  }

  /**
   * Uruchamia pełną analizę: sprite generation + Claude Vision query
   */
  async analyze(request: ClaudeVisionTestRequest): Promise<ClaudeVisionTestResponse> {
    const startTime = Date.now();
    let spritePath: string | null = null;

    try {
      const { videoPath, model, frameWidth: requestedFrameWidth, maxFrames: requestedMaxFrames } = request;

      // Walidacja pliku wideo
      if (!fs.existsSync(videoPath)) {
        throw new Error(`Plik wideo nie istnieje: ${videoPath}`);
      }

      // Pobranie metadanych wideo
      const metadata = await this.ffmpegCLI.getVideoMetadata(videoPath);
      if (!metadata) {
        throw new Error('Nie udało się odczytać metadanych wideo');
      }

      const frameWidth = requestedFrameWidth || SCENE_SPRITE_CONFIG.frameWidth;
      const maxFrames = requestedMaxFrames ?? SCENE_SPRITE_CONFIG.maxFrames;

      // Oblicz layout sprite'a (cały film = jedna scena)
      const totalFrames = metadata.frameCount;
      const layout = this.calculateSceneSpriteLayout(totalFrames, maxFrames);

      // Wygeneruj sprite sheet
      const tempDir = path.join(os.tmpdir(), 'clamka-vision-test');
      await fsPromises.mkdir(tempDir, { recursive: true });
      spritePath = path.join(tempDir, `vision_test_${Date.now()}.jpg`);

      const spriteResult = await this.ffmpegCLI.generateSceneSpriteSheet(
        videoPath,
        spritePath,
        {
          startFrame: 0,
          endFrame: totalFrames,
          sourceFps: metadata.fps,
          frameWidth,
          quality: SCENE_SPRITE_CONFIG.quality,
          cols: layout.cols,
          rows: layout.rows,
        }
      );

      // Odczytaj sprite jako base64
      const imageData = await fsPromises.readFile(spritePath);
      const base64 = imageData.toString('base64');

      // Pobierz prompty z pliku .md (tak jak robi ClaudeVisionAnalysisService)
      const visionPrompts = promptLoaderService.getVisionPrompt('scene-analysis');
      if (!visionPrompts) {
        throw new Error('Brak pliku prompts: shared/prompts/vision/scene-analysis.md');
      }

      // Oblicz durationContext na podstawie metadanych wideo
      const videoDurationSec = metadata.duration;
      const secondsPerSpriteFrame = videoDurationSec / spriteResult.totalFrames;
      const durationContext = `Czas trwania: ${videoDurationSec.toFixed(1)}s. Sprite: ${spriteResult.totalFrames} klatek. 1 klatka ~ ${secondsPerSpriteFrame.toFixed(1)}s filmu.`;

      // Podstaw {{durationContext}} automatycznie, {{projectContext}} pozostaw do ręcznej edycji
      const fileSystemPrompt = visionPrompts.systemPrompt
        .replace('{{durationContext}}', durationContext);

      // Przygotuj defaultPrompt (do wyświetlenia w response) - tylko user message
      const defaultPrompt = visionPrompts.userMessage;

      // usedPrompt - jeśli użytkownik podał custom prompt, użyj go; inaczej userMessage z pliku
      const usedPrompt = request.prompt?.trim() || visionPrompts.userMessage;

      // Budowa systemPrompt na podstawie mode
      let sdkSystemPrompt: string | { type: 'preset'; preset: string; append: string } | undefined;
      if (request.systemPrompt?.trim()) {
        // Użytkownik podał własny systemPrompt przez UI
        if (request.systemPromptMode === 'replace') {
          sdkSystemPrompt = request.systemPrompt;
        } else {
          // append (domyślny)
          sdkSystemPrompt = { type: 'preset', preset: 'claude_code', append: request.systemPrompt };
        }
      } else {
        // Brak custom systemPrompt - użyj systemPrompt z pliku .md
        sdkSystemPrompt = fileSystemPrompt;
      }

      // Wywołanie Claude Vision z content blocks
      const result = await this.claudeCLI.queryWithContentBlocks({
        contentBlocks: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: usedPrompt },
        ],
        allowedTools: [],
        settingSources: ['project'],
        timeout: 300000, // 5 minut
        model: model,
        systemPrompt: sdkSystemPrompt,
      });

      const rawResponse = result.text;
      const tokenUsage = result.usage;

      // Parsowanie JSON z odpowiedzi
      let parsed: SceneDescription | null = null;
      let parseError: string | undefined;

      try {
        const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          parseError = 'Brak obiektu JSON w odpowiedzi';
        } else {
          const candidate = JSON.parse(jsonMatch[0]) as SceneDescription;

          // Walidacja struktury
          if (!candidate.location || !candidate.content || !candidate.mood ||
            !Array.isArray(candidate.subjects) || !Array.isArray(candidate.actions) ||
            !candidate.cameraMovement || !candidate.framing) {
            parseError = 'Niepełna struktura SceneDescription - brakuje wymaganych pól';
          } else {
            parsed = candidate;
          }
        }
      } catch (e) {
        parseError = `Błąd parsowania JSON: ${(e as Error).message}`;
      }

      // Budowa historii wiadomości
      const now = Date.now();
      const messages: RawMessage[] = [
        {
          role: 'user',
          timestamp: now - 1,
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: usedPrompt },
          ],
        },
        {
          role: 'assistant',
          timestamp: now,
          content: [
            { type: 'text', text: rawResponse },
          ],
        },
      ];

      // Oblicz frameInterval (co ile klatek źródłowych jest klatka w sprite)
      const frameInterval = Math.floor(metadata.frameCount / spriteResult.totalFrames);

      // Sprawdź czy actions są w formacie tuple [opis, startFrame, endFrame]
      // i przelicz na source frames
      let actionsWithSourceFrames: SceneActionWithSourceFrames[] | undefined;
      if (parsed?.actions && Array.isArray(parsed.actions)) {
        const firstAction = parsed.actions[0];
        // Sprawdź czy pierwszy element to tuple (array z 3 elementami)
        if (Array.isArray(firstAction) && firstAction.length === 3 &&
            typeof firstAction[0] === 'string' &&
            typeof firstAction[1] === 'number' &&
            typeof firstAction[2] === 'number') {
          // Actions są w formacie tuple - przelicz na source frames
          actionsWithSourceFrames = convertSpriteActionsToSourceFrames(
            parsed.actions as unknown as SceneActionTuple[],
            frameInterval
          );
        }
      }

      return {
        messages,
        spriteSheet: {
          base64,
          cols: spriteResult.cols,
          rows: spriteResult.rows,
          frameWidth: spriteResult.frameWidth,
          frameHeight: spriteResult.frameHeight,
          totalFrames: spriteResult.totalFrames,
          frameInterval,
        },
        videoMetadata: {
          width: metadata.width,
          height: metadata.height,
          fps: metadata.fps,
          duration: metadata.duration,
          frameCount: metadata.frameCount,
        },
        parsed,
        parseError,
        defaultPrompt,
        defaultSystemPrompt: fileSystemPrompt,
        usedPrompt,
        durationMs: Date.now() - startTime,
        usedSystemPrompt: request.systemPrompt?.trim() || undefined,
        systemPromptMode: request.systemPrompt?.trim() ? (request.systemPromptMode || 'append') : undefined,
        tokenUsage,
        actionsWithSourceFrames,
      };
    } finally {
      // Cleanup sprite file
      if (spritePath) {
        try {
          await fsPromises.unlink(spritePath);
        } catch {
          // Ignoruj błędy cleanup
        }
      }
    }
  }

  /**
   * Oblicza optymalny layout siatki sprite'a (z ClaudeVisionAnalysisService)
   * @param sceneDurationFrames - liczba klatek sceny
   * @param maxFrames - maksymalna liczba klatek w sprite (domyślnie z SCENE_SPRITE_CONFIG)
   */
  private calculateSceneSpriteLayout(sceneDurationFrames: number, maxFrames?: number): {
    cols: number;
    rows: number;
    targetFrames: number;
  } {
    const effectiveMaxFrames = maxFrames ?? SCENE_SPRITE_CONFIG.maxFrames;
    const desiredFrames = Math.min(
      effectiveMaxFrames,
      Math.ceil(sceneDurationFrames / 15)
    );

    // Filtruj layouty do tych które mają capacity <= maxFrames
    const eligibleLayouts = SCENE_SPRITE_CONFIG.preferredLayouts.filter(
      l => l.capacity <= effectiveMaxFrames
    );

    for (const layout of eligibleLayouts) {
      if (desiredFrames >= layout.capacity - 2) {
        return {
          cols: layout.cols,
          rows: layout.rows,
          targetFrames: layout.capacity,
        };
      }
    }

    // Wybierz największy z dozwolonych layoutów
    const fallback = eligibleLayouts.length > 0
      ? eligibleLayouts[0]
      : SCENE_SPRITE_CONFIG.preferredLayouts[SCENE_SPRITE_CONFIG.preferredLayouts.length - 1];
    return {
      cols: fallback.cols,
      rows: fallback.rows,
      targetFrames: fallback.capacity,
    };
  }
}

export const claudeVisionTestService = new ClaudeVisionTestService();
