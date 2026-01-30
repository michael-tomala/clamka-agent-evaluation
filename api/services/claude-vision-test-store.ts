/**
 * ClaudeVisionTestStore - persystencja testów Claude Vision
 *
 * Zapisuje wyniki testów do SQLite + pliki sprite'ów jako JPEG
 * Wzorzec analogiczny do ResultsStore (results-store.ts)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { ClaudeVisionTestResponse } from './claude-vision-test-service';
import type { ClaudeVisionTestRequest } from './claude-vision-test-service';
import { SceneDescription } from '../../../shared/types';

// ============================================================================
// TYPES
// ============================================================================

export interface ClaudeVisionTestRecord {
  id: string;
  createdAt: string;

  // Konfiguracja
  videoPath: string;
  model: string;
  frameWidth: number;
  maxFrames: number;
  prompt: string;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';

  // Metadane wideo
  videoWidth?: number;
  videoHeight?: number;
  videoFps?: number;
  videoDuration?: number;
  videoFrameCount?: number;

  // Metadane sprite
  spriteCols?: number;
  spriteRows?: number;
  spriteFrameWidth?: number;
  spriteFrameHeight?: number;
  spriteTotalFrames?: number;
  spriteFilePath?: string;

  // Wyniki
  parsedResult?: SceneDescription;
  parseError?: string;
  rawResponse: string;

  // Metryki
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;

  // Koszt
  costUsd?: number;

  // Etykieta
  label?: string;
}

/** Konfiguracja do załadowania (bez wyników i metryk) */
export interface ClaudeVisionTestConfig {
  videoPath: string;
  model: string;
  frameWidth: number;
  maxFrames: number;
  prompt: string;
  systemPrompt?: string;
  systemPromptMode?: 'append' | 'replace';
}

export interface ListTestsOptions {
  limit?: number;
  offset?: number;
  model?: string;
}

// ============================================================================
// PRICING
// ============================================================================

/**
 * Cennik Anthropic (per MTok = 1,000,000 tokenów)
 * https://www.anthropic.com/pricing
 */
const MODEL_PRICING: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  haiku: { input: 1, output: 5, cacheRead: 0.10, cacheWrite: 1.25 },
  sonnet: { input: 3, output: 15, cacheRead: 0.30, cacheWrite: 3.75 },
  opus: { input: 15, output: 75, cacheRead: 1.50, cacheWrite: 18.75 },
};

function calculateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.sonnet;
  return (
    inputTokens * pricing.input +
    outputTokens * pricing.output +
    cacheReadTokens * pricing.cacheRead +
    cacheCreationTokens * pricing.cacheWrite
  ) / 1_000_000;
}

// ============================================================================
// STORE
// ============================================================================

export class ClaudeVisionTestStore {
  private db: Database.Database;
  private spritesDir: string;

  constructor(dbPath?: string) {
    const baseDir = path.join(__dirname, '../../agent-evals/results');

    // Upewnij się, że katalog istnieje
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const dbFilePath = dbPath || path.join(baseDir, 'claude-vision-tests.db');
    this.db = new Database(dbFilePath);

    // Katalog na sprite'y
    this.spritesDir = path.join(baseDir, 'sprites');
    if (!fs.existsSync(this.spritesDir)) {
      fs.mkdirSync(this.spritesDir, { recursive: true });
    }

    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS claude_vision_tests (
        id TEXT PRIMARY KEY,
        created_at TEXT NOT NULL,

        -- Konfiguracja
        video_path TEXT NOT NULL,
        model TEXT NOT NULL,
        frame_width INTEGER NOT NULL,
        max_frames INTEGER NOT NULL,
        prompt TEXT NOT NULL,
        system_prompt TEXT,
        system_prompt_mode TEXT,

        -- Metadane wideo
        video_width INTEGER,
        video_height INTEGER,
        video_fps REAL,
        video_duration REAL,
        video_frame_count INTEGER,

        -- Metadane sprite
        sprite_cols INTEGER,
        sprite_rows INTEGER,
        sprite_frame_width INTEGER,
        sprite_frame_height INTEGER,
        sprite_total_frames INTEGER,
        sprite_file_path TEXT,

        -- Wyniki
        parsed_result TEXT,
        parse_error TEXT,
        raw_response TEXT NOT NULL,

        -- Metryki
        duration_ms INTEGER NOT NULL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        cache_read_input_tokens INTEGER,
        cache_creation_input_tokens INTEGER,

        -- Koszt
        cost_usd REAL,

        -- Etykieta
        label TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_vision_tests_created_at ON claude_vision_tests(created_at);
      CREATE INDEX IF NOT EXISTS idx_vision_tests_model ON claude_vision_tests(model);
      CREATE INDEX IF NOT EXISTS idx_vision_tests_video_path ON claude_vision_tests(video_path);
    `);

    // Migracja: dodaj kolumnę cost_usd jeśli nie istnieje (dla tabel utworzonych przed dodaniem tej kolumny)
    const columns = this.db.pragma('table_info(claude_vision_tests)') as { name: string }[];
    const columnNames = columns.map(c => c.name);

    if (!columnNames.includes('cost_usd')) {
      this.db.exec('ALTER TABLE claude_vision_tests ADD COLUMN cost_usd REAL');
    }
  }

  /**
   * Zapisuje test + sprite do pliku
   */
  async saveTest(
    response: ClaudeVisionTestResponse,
    request: ClaudeVisionTestRequest
  ): Promise<ClaudeVisionTestRecord> {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    // Zapisz sprite do pliku
    let spriteFilePath: string | undefined;
    if (response.spriteSheet?.base64) {
      spriteFilePath = path.join(this.spritesDir, `${id}.jpg`);
      const buffer = Buffer.from(response.spriteSheet.base64, 'base64');
      await fsPromises.writeFile(spriteFilePath, buffer);
    }

    // Wyciągnij raw response z messages
    const rawResponse = response.messages
      .filter(m => m.role === 'assistant')
      .flatMap(m => m.content)
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('\n');

    // Oblicz koszt
    const model = request.model || 'sonnet';
    const costUsd = calculateCostUsd(
      model,
      response.tokenUsage?.inputTokens || 0,
      response.tokenUsage?.outputTokens || 0,
      response.tokenUsage?.cacheReadInputTokens || 0,
      response.tokenUsage?.cacheCreationInputTokens || 0
    );

    const stmt = this.db.prepare(`
      INSERT INTO claude_vision_tests (
        id, created_at,
        video_path, model, frame_width, max_frames, prompt, system_prompt, system_prompt_mode,
        video_width, video_height, video_fps, video_duration, video_frame_count,
        sprite_cols, sprite_rows, sprite_frame_width, sprite_frame_height, sprite_total_frames, sprite_file_path,
        parsed_result, parse_error, raw_response,
        duration_ms, input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens, cost_usd
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      createdAt,
      request.videoPath,
      request.model || 'sonnet',
      request.frameWidth || 240,
      request.maxFrames || 20,
      response.usedPrompt,
      request.systemPrompt || null,
      request.systemPromptMode || null,
      response.videoMetadata?.width || null,
      response.videoMetadata?.height || null,
      response.videoMetadata?.fps || null,
      response.videoMetadata?.duration || null,
      response.videoMetadata?.frameCount || null,
      response.spriteSheet?.cols || null,
      response.spriteSheet?.rows || null,
      response.spriteSheet?.frameWidth || null,
      response.spriteSheet?.frameHeight || null,
      response.spriteSheet?.totalFrames || null,
      spriteFilePath || null,
      response.parsed ? JSON.stringify(response.parsed) : null,
      response.parseError || null,
      rawResponse,
      response.durationMs,
      response.tokenUsage?.inputTokens || null,
      response.tokenUsage?.outputTokens || null,
      response.tokenUsage?.cacheReadInputTokens || null,
      response.tokenUsage?.cacheCreationInputTokens || null,
      costUsd > 0 ? costUsd : null
    );

    return {
      id,
      createdAt,
      videoPath: request.videoPath,
      model: request.model || 'sonnet',
      frameWidth: request.frameWidth || 240,
      maxFrames: request.maxFrames || 20,
      prompt: response.usedPrompt,
      systemPrompt: request.systemPrompt,
      systemPromptMode: request.systemPromptMode,
      videoWidth: response.videoMetadata?.width,
      videoHeight: response.videoMetadata?.height,
      videoFps: response.videoMetadata?.fps,
      videoDuration: response.videoMetadata?.duration,
      videoFrameCount: response.videoMetadata?.frameCount,
      spriteCols: response.spriteSheet?.cols,
      spriteRows: response.spriteSheet?.rows,
      spriteFrameWidth: response.spriteSheet?.frameWidth,
      spriteFrameHeight: response.spriteSheet?.frameHeight,
      spriteTotalFrames: response.spriteSheet?.totalFrames,
      spriteFilePath,
      parsedResult: response.parsed || undefined,
      parseError: response.parseError,
      rawResponse,
      durationMs: response.durationMs,
      inputTokens: response.tokenUsage?.inputTokens,
      outputTokens: response.tokenUsage?.outputTokens,
      cacheReadInputTokens: response.tokenUsage?.cacheReadInputTokens,
      cacheCreationInputTokens: response.tokenUsage?.cacheCreationInputTokens,
      costUsd: costUsd > 0 ? costUsd : undefined,
    };
  }

  /**
   * Pobiera test bez sprite base64
   */
  getTest(id: string): ClaudeVisionTestRecord | null {
    const row = this.db.prepare(`
      SELECT * FROM claude_vision_tests WHERE id = ?
    `).get(id) as DbRow | undefined;

    if (!row) return null;

    return this.mapRowToRecord(row);
  }

  /**
   * Lista testów (limit, offset, model filter)
   */
  listTests(options?: ListTestsOptions): ClaudeVisionTestRecord[] {
    let query = 'SELECT * FROM claude_vision_tests';
    const params: unknown[] = [];

    if (options?.model) {
      query += ' WHERE model = ?';
      params.push(options.model);
    }

    query += ' ORDER BY created_at DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const rows = this.db.prepare(query).all(...params) as DbRow[];

    return rows.map(row => this.mapRowToRecord(row));
  }

  /**
   * Usuwa test + plik sprite
   */
  async deleteTest(id: string): Promise<boolean> {
    const row = this.db.prepare(`
      SELECT sprite_file_path FROM claude_vision_tests WHERE id = ?
    `).get(id) as { sprite_file_path: string | null } | undefined;

    if (!row) return false;

    // Usuń plik sprite jeśli istnieje
    if (row.sprite_file_path) {
      try {
        await fsPromises.unlink(row.sprite_file_path);
      } catch {
        // Ignoruj błędy usuwania pliku
      }
    }

    // Usuń z bazy
    this.db.prepare('DELETE FROM claude_vision_tests WHERE id = ?').run(id);

    return true;
  }

  /**
   * Ładuje sprite z pliku jako base64
   */
  async getSpriteBase64(id: string): Promise<string | null> {
    const row = this.db.prepare(`
      SELECT sprite_file_path FROM claude_vision_tests WHERE id = ?
    `).get(id) as { sprite_file_path: string | null } | undefined;

    if (!row?.sprite_file_path) return null;

    try {
      const buffer = await fsPromises.readFile(row.sprite_file_path);
      return buffer.toString('base64');
    } catch {
      return null;
    }
  }

  /**
   * Aktualizuje etykietę
   */
  updateLabel(id: string, label: string | null): boolean {
    const result = this.db.prepare(`
      UPDATE claude_vision_tests SET label = ? WHERE id = ?
    `).run(label, id);

    return result.changes > 0;
  }

  /**
   * Pobiera tylko konfigurację testu (do załadowania)
   */
  getTestConfig(id: string): ClaudeVisionTestConfig | null {
    const row = this.db.prepare(`
      SELECT video_path, model, frame_width, max_frames, prompt, system_prompt, system_prompt_mode
      FROM claude_vision_tests WHERE id = ?
    `).get(id) as {
      video_path: string;
      model: string;
      frame_width: number;
      max_frames: number;
      prompt: string;
      system_prompt: string | null;
      system_prompt_mode: string | null;
    } | undefined;

    if (!row) return null;

    return {
      videoPath: row.video_path,
      model: row.model,
      frameWidth: row.frame_width,
      maxFrames: row.max_frames,
      prompt: row.prompt,
      systemPrompt: row.system_prompt || undefined,
      systemPromptMode: (row.system_prompt_mode as 'append' | 'replace') || undefined,
    };
  }

  /**
   * Zamyka połączenie z bazą
   */
  close(): void {
    this.db.close();
  }

  // ============================================================================
  // PRIVATE HELPERS
  // ============================================================================

  private mapRowToRecord(row: DbRow): ClaudeVisionTestRecord {
    return {
      id: row.id,
      createdAt: row.created_at,
      videoPath: row.video_path,
      model: row.model,
      frameWidth: row.frame_width,
      maxFrames: row.max_frames,
      prompt: row.prompt,
      systemPrompt: row.system_prompt || undefined,
      systemPromptMode: (row.system_prompt_mode as 'append' | 'replace') || undefined,
      videoWidth: row.video_width || undefined,
      videoHeight: row.video_height || undefined,
      videoFps: row.video_fps || undefined,
      videoDuration: row.video_duration || undefined,
      videoFrameCount: row.video_frame_count || undefined,
      spriteCols: row.sprite_cols || undefined,
      spriteRows: row.sprite_rows || undefined,
      spriteFrameWidth: row.sprite_frame_width || undefined,
      spriteFrameHeight: row.sprite_frame_height || undefined,
      spriteTotalFrames: row.sprite_total_frames || undefined,
      spriteFilePath: row.sprite_file_path || undefined,
      parsedResult: row.parsed_result ? JSON.parse(row.parsed_result) : undefined,
      parseError: row.parse_error || undefined,
      rawResponse: row.raw_response,
      durationMs: row.duration_ms,
      inputTokens: row.input_tokens || undefined,
      outputTokens: row.output_tokens || undefined,
      cacheReadInputTokens: row.cache_read_input_tokens || undefined,
      cacheCreationInputTokens: row.cache_creation_input_tokens || undefined,
      costUsd: row.cost_usd || undefined,
      label: row.label || undefined,
    };
  }
}

// Typ dla row z bazy
interface DbRow {
  id: string;
  created_at: string;
  video_path: string;
  model: string;
  frame_width: number;
  max_frames: number;
  prompt: string;
  system_prompt: string | null;
  system_prompt_mode: string | null;
  video_width: number | null;
  video_height: number | null;
  video_fps: number | null;
  video_duration: number | null;
  video_frame_count: number | null;
  sprite_cols: number | null;
  sprite_rows: number | null;
  sprite_frame_width: number | null;
  sprite_frame_height: number | null;
  sprite_total_frames: number | null;
  sprite_file_path: string | null;
  parsed_result: string | null;
  parse_error: string | null;
  raw_response: string;
  duration_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_input_tokens: number | null;
  cache_creation_input_tokens: number | null;
  cost_usd: number | null;
  label: string | null;
}

// ============================================================================
// SINGLETON
// ============================================================================

let instance: ClaudeVisionTestStore | null = null;

export function getClaudeVisionTestStore(): ClaudeVisionTestStore {
  if (!instance) {
    instance = new ClaudeVisionTestStore();
  }
  return instance;
}
