/**
 * Transcription Eval Store - SQLite persistence
 *
 * Przechowuje:
 * - Ground truth segmenty (ręczne anotacje)
 * - Konfiguracje assetów audio (ścieżki do plików)
 * - Wyniki ewaluacji (runs + results)
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type {
  GroundTruthSegment,
  GroundTruthSegmentInput,
  TranscriptionAssetConfig,
  TranscriptionEvalResult,
  TranscriptionEvalRun,
  TranscriptionEvalStatus,
  TranscriptionBackend,
  TranscriptionEvalOptions,
  SegmentMatch,
  TranscriptionSegmentOutput,
} from '../types/transcription-eval';

// ============================================================================
// SCHEMA
// ============================================================================

const SCHEMA = `
-- Konfiguracja assetów audio (ścieżki do lokalnych plików)
CREATE TABLE IF NOT EXISTS transcription_asset_configs (
  id TEXT PRIMARY KEY,
  assetId TEXT NOT NULL UNIQUE,
  audioFilePath TEXT NOT NULL,
  sourceFps REAL NOT NULL DEFAULT 30.0,
  language TEXT NOT NULL DEFAULT 'pl',
  label TEXT,
  createdDate TEXT NOT NULL
);

-- Ground truth segmenty
CREATE TABLE IF NOT EXISTS transcription_ground_truth (
  id TEXT PRIMARY KEY,
  assetId TEXT NOT NULL,
  text TEXT NOT NULL,
  startMs REAL NOT NULL,
  endMs REAL NOT NULL,
  fileRelativeStartFrame INTEGER NOT NULL,
  fileRelativeEndFrame INTEGER NOT NULL,
  orderIndex INTEGER NOT NULL DEFAULT 0,
  speakerId TEXT,
  createdDate TEXT NOT NULL,
  modifiedDate TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_gt_asset ON transcription_ground_truth(assetId);
CREATE INDEX IF NOT EXISTS idx_gt_order ON transcription_ground_truth(assetId, orderIndex);

-- Eval runs (grupy wyników)
CREATE TABLE IF NOT EXISTS transcription_eval_runs (
  id TEXT PRIMARY KEY,
  label TEXT,
  backend TEXT NOT NULL,
  language TEXT NOT NULL,
  assetIds TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  totalAssets INTEGER NOT NULL DEFAULT 0,
  completedAssets INTEGER NOT NULL DEFAULT 0,
  createdDate TEXT NOT NULL,
  completedDate TEXT
);

CREATE INDEX IF NOT EXISTS idx_eval_runs_created ON transcription_eval_runs(createdDate);
CREATE INDEX IF NOT EXISTS idx_eval_runs_status ON transcription_eval_runs(status);

-- Eval results (wyniki per asset per run)
CREATE TABLE IF NOT EXISTS transcription_eval_results (
  id TEXT PRIMARY KEY,
  evalRunId TEXT NOT NULL,
  assetId TEXT NOT NULL,
  backend TEXT NOT NULL,
  language TEXT NOT NULL,
  options TEXT,

  avgStartDiffMs REAL NOT NULL DEFAULT 0,
  avgEndDiffMs REAL NOT NULL DEFAULT 0,
  maxStartDiffMs REAL NOT NULL DEFAULT 0,
  maxEndDiffMs REAL NOT NULL DEFAULT 0,
  matchPercentage REAL NOT NULL DEFAULT 0,
  avgIoU REAL NOT NULL DEFAULT 0,
  totalGroundTruthSegments INTEGER NOT NULL DEFAULT 0,
  totalPredictedSegments INTEGER NOT NULL DEFAULT 0,

  segmentMatches TEXT NOT NULL,
  predictedSegments TEXT NOT NULL,
  transcriptionDurationMs INTEGER NOT NULL DEFAULT 0,

  createdDate TEXT NOT NULL,

  FOREIGN KEY (evalRunId) REFERENCES transcription_eval_runs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_eval_results_run ON transcription_eval_results(evalRunId);
CREATE INDEX IF NOT EXISTS idx_eval_results_asset ON transcription_eval_results(assetId);
`;

// ============================================================================
// STORE
// ============================================================================

class TranscriptionEvalStore {
  private db: Database.Database;

  constructor(dbPath?: string) {
    const baseDir = path.join(__dirname, '../../agent-evals/results');
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const dbFilePath = dbPath || path.join(baseDir, 'transcription-evals.db');
    this.db = new Database(dbFilePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(SCHEMA);
  }

  // ==========================================================================
  // ASSET CONFIGS
  // ==========================================================================

  getAssetConfigs(): TranscriptionAssetConfig[] {
    return this.db.prepare('SELECT * FROM transcription_asset_configs ORDER BY createdDate DESC').all() as TranscriptionAssetConfig[];
  }

  getAssetConfig(assetId: string): TranscriptionAssetConfig | undefined {
    return this.db.prepare('SELECT * FROM transcription_asset_configs WHERE assetId = ?').get(assetId) as TranscriptionAssetConfig | undefined;
  }

  upsertAssetConfig(config: Omit<TranscriptionAssetConfig, 'id' | 'createdDate'>): TranscriptionAssetConfig {
    const existing = this.getAssetConfig(config.assetId);
    if (existing) {
      this.db.prepare(`
        UPDATE transcription_asset_configs
        SET audioFilePath = ?, sourceFps = ?, language = ?, label = ?
        WHERE assetId = ?
      `).run(config.audioFilePath, config.sourceFps, config.language, config.label || null, config.assetId);
      return this.getAssetConfig(config.assetId)!;
    }

    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO transcription_asset_configs (id, assetId, audioFilePath, sourceFps, language, label, createdDate)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, config.assetId, config.audioFilePath, config.sourceFps, config.language, config.label || null, now);

    return this.getAssetConfig(config.assetId)!;
  }

  deleteAssetConfig(assetId: string): boolean {
    const result = this.db.prepare('DELETE FROM transcription_asset_configs WHERE assetId = ?').run(assetId);
    return result.changes > 0;
  }

  // ==========================================================================
  // GROUND TRUTH SEGMENTS
  // ==========================================================================

  getGroundTruth(assetId: string): GroundTruthSegment[] {
    return this.db.prepare(
      'SELECT * FROM transcription_ground_truth WHERE assetId = ? ORDER BY orderIndex ASC'
    ).all(assetId) as GroundTruthSegment[];
  }

  getGroundTruthSegment(id: string): GroundTruthSegment | undefined {
    return this.db.prepare('SELECT * FROM transcription_ground_truth WHERE id = ?').get(id) as GroundTruthSegment | undefined;
  }

  createGroundTruthSegment(input: GroundTruthSegmentInput): GroundTruthSegment {
    const id = uuidv4();
    const now = new Date().toISOString();

    // Oblicz klatki z ms + sourceFps
    const startFrame = Math.round((input.startMs / 1000) * input.sourceFps);
    const endFrame = Math.round((input.endMs / 1000) * input.sourceFps);

    this.db.prepare(`
      INSERT INTO transcription_ground_truth (id, assetId, text, startMs, endMs, fileRelativeStartFrame, fileRelativeEndFrame, orderIndex, speakerId, createdDate, modifiedDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.assetId, input.text, input.startMs, input.endMs, startFrame, endFrame, input.orderIndex, input.speakerId || null, now, now);

    return this.getGroundTruthSegment(id)!;
  }

  updateGroundTruthSegment(id: string, input: Partial<GroundTruthSegmentInput>): GroundTruthSegment | undefined {
    const existing = this.getGroundTruthSegment(id);
    if (!existing) return undefined;

    const now = new Date().toISOString();
    const text = input.text ?? existing.text;
    const startMs = input.startMs ?? existing.startMs;
    const endMs = input.endMs ?? existing.endMs;
    const orderIndex = input.orderIndex ?? existing.orderIndex;
    const speakerId = input.speakerId !== undefined ? input.speakerId : existing.speakerId;
    const sourceFps = input.sourceFps ?? 30;

    const startFrame = Math.round((startMs / 1000) * sourceFps);
    const endFrame = Math.round((endMs / 1000) * sourceFps);

    this.db.prepare(`
      UPDATE transcription_ground_truth
      SET text = ?, startMs = ?, endMs = ?, fileRelativeStartFrame = ?, fileRelativeEndFrame = ?, orderIndex = ?, speakerId = ?, modifiedDate = ?
      WHERE id = ?
    `).run(text, startMs, endMs, startFrame, endFrame, orderIndex, speakerId || null, now, id);

    return this.getGroundTruthSegment(id);
  }

  deleteGroundTruthSegment(id: string): boolean {
    const result = this.db.prepare('DELETE FROM transcription_ground_truth WHERE id = ?').run(id);
    return result.changes > 0;
  }

  deleteAllGroundTruth(assetId: string): number {
    const result = this.db.prepare('DELETE FROM transcription_ground_truth WHERE assetId = ?').run(assetId);
    return result.changes;
  }

  /** Import wielu segmentów ground truth (batch) */
  importGroundTruth(assetId: string, segments: GroundTruthSegmentInput[]): GroundTruthSegment[] {
    const insertMany = this.db.transaction((segs: GroundTruthSegmentInput[]) => {
      // Usuń istniejące
      this.db.prepare('DELETE FROM transcription_ground_truth WHERE assetId = ?').run(assetId);

      const results: GroundTruthSegment[] = [];
      for (const seg of segs) {
        results.push(this.createGroundTruthSegment(seg));
      }
      return results;
    });

    return insertMany(segments);
  }

  /** Eksportuj ground truth jako JSON */
  exportGroundTruth(assetId: string): { assetId: string; segments: GroundTruthSegment[] } {
    return {
      assetId,
      segments: this.getGroundTruth(assetId),
    };
  }

  /** Lista assetów z ground truth */
  getAssetsWithGroundTruth(): Array<{ assetId: string; segmentCount: number }> {
    return this.db.prepare(`
      SELECT assetId, COUNT(*) as segmentCount
      FROM transcription_ground_truth
      GROUP BY assetId
      ORDER BY assetId
    `).all() as Array<{ assetId: string; segmentCount: number }>;
  }

  // ==========================================================================
  // EVAL RUNS
  // ==========================================================================

  createEvalRun(params: {
    label?: string;
    backend: TranscriptionBackend;
    language: string;
    assetIds: string[];
  }): TranscriptionEvalRun {
    const id = uuidv4();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO transcription_eval_runs (id, label, backend, language, assetIds, status, totalAssets, completedAssets, createdDate)
      VALUES (?, ?, ?, ?, ?, 'pending', ?, 0, ?)
    `).run(id, params.label || null, params.backend, params.language, JSON.stringify(params.assetIds), params.assetIds.length, now);

    return this.getEvalRun(id)!;
  }

  getEvalRun(id: string): TranscriptionEvalRun | undefined {
    const row = this.db.prepare('SELECT * FROM transcription_eval_runs WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;

    const results = this.getEvalResults(id);
    return {
      id: row.id as string,
      label: row.label as string | undefined,
      backend: row.backend as TranscriptionBackend,
      language: row.language as string,
      assetIds: JSON.parse(row.assetIds as string),
      status: row.status as TranscriptionEvalStatus,
      totalAssets: row.totalAssets as number,
      completedAssets: row.completedAssets as number,
      results,
      createdDate: row.createdDate as string,
      completedDate: row.completedDate as string | undefined,
    };
  }

  getEvalRuns(limit = 50): TranscriptionEvalRun[] {
    const rows = this.db.prepare(
      'SELECT id FROM transcription_eval_runs ORDER BY createdDate DESC LIMIT ?'
    ).all(limit) as Array<{ id: string }>;

    return rows.map(r => this.getEvalRun(r.id)!).filter(Boolean);
  }

  updateEvalRunStatus(id: string, status: TranscriptionEvalStatus, completedAssets?: number): void {
    const updates: string[] = ['status = ?'];
    const params: unknown[] = [status];

    if (completedAssets !== undefined) {
      updates.push('completedAssets = ?');
      params.push(completedAssets);
    }

    if (status === 'completed' || status === 'error') {
      updates.push('completedDate = ?');
      params.push(new Date().toISOString());
    }

    params.push(id);
    this.db.prepare(`UPDATE transcription_eval_runs SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  deleteEvalRun(id: string): boolean {
    const result = this.db.prepare('DELETE FROM transcription_eval_runs WHERE id = ?').run(id);
    return result.changes > 0;
  }

  // ==========================================================================
  // EVAL RESULTS
  // ==========================================================================

  saveEvalResult(result: TranscriptionEvalResult): void {
    this.db.prepare(`
      INSERT INTO transcription_eval_results (
        id, evalRunId, assetId, backend, language, options,
        avgStartDiffMs, avgEndDiffMs, maxStartDiffMs, maxEndDiffMs,
        matchPercentage, avgIoU, totalGroundTruthSegments, totalPredictedSegments,
        segmentMatches, predictedSegments, transcriptionDurationMs, createdDate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.id, result.evalRunId, result.assetId, result.backend, result.language,
      JSON.stringify(result.options),
      result.avgStartDiffMs, result.avgEndDiffMs, result.maxStartDiffMs, result.maxEndDiffMs,
      result.matchPercentage, result.avgIoU, result.totalGroundTruthSegments, result.totalPredictedSegments,
      JSON.stringify(result.segmentMatches), JSON.stringify(result.predictedSegments),
      result.transcriptionDurationMs, result.createdDate
    );
  }

  getEvalResults(evalRunId: string): TranscriptionEvalResult[] {
    const rows = this.db.prepare(
      'SELECT * FROM transcription_eval_results WHERE evalRunId = ? ORDER BY createdDate ASC'
    ).all(evalRunId) as Array<Record<string, unknown>>;

    return rows.map(row => this.parseEvalResultRow(row));
  }

  getEvalResult(id: string): TranscriptionEvalResult | undefined {
    const row = this.db.prepare('SELECT * FROM transcription_eval_results WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return this.parseEvalResultRow(row);
  }

  /** Pobierz historię wyników dla assetu (do porównywania między runami) */
  getAssetResultHistory(assetId: string, limit = 20): TranscriptionEvalResult[] {
    const rows = this.db.prepare(
      'SELECT * FROM transcription_eval_results WHERE assetId = ? ORDER BY createdDate DESC LIMIT ?'
    ).all(assetId, limit) as Array<Record<string, unknown>>;

    return rows.map(row => this.parseEvalResultRow(row));
  }

  private parseEvalResultRow(row: Record<string, unknown>): TranscriptionEvalResult {
    return {
      id: row.id as string,
      evalRunId: row.evalRunId as string,
      assetId: row.assetId as string,
      backend: row.backend as TranscriptionBackend,
      language: row.language as string,
      options: JSON.parse((row.options as string) || '{}') as TranscriptionEvalOptions,
      avgStartDiffMs: row.avgStartDiffMs as number,
      avgEndDiffMs: row.avgEndDiffMs as number,
      maxStartDiffMs: row.maxStartDiffMs as number,
      maxEndDiffMs: row.maxEndDiffMs as number,
      matchPercentage: row.matchPercentage as number,
      avgIoU: row.avgIoU as number,
      totalGroundTruthSegments: row.totalGroundTruthSegments as number,
      totalPredictedSegments: row.totalPredictedSegments as number,
      segmentMatches: JSON.parse(row.segmentMatches as string) as SegmentMatch[],
      predictedSegments: JSON.parse(row.predictedSegments as string) as TranscriptionSegmentOutput[],
      transcriptionDurationMs: row.transcriptionDurationMs as number,
      createdDate: row.createdDate as string,
    };
  }
}

// Singleton
export const transcriptionEvalStore = new TranscriptionEvalStore();
