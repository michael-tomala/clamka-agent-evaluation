/**
 * Transcription Evaluation Service
 *
 * Główny serwis systemu ewaluacji transkrypcji.
 * Wzorzec: CompositionTestService (EventEmitter, async jobs, in-memory tracking).
 *
 * Odpowiedzialności:
 * - Zarządzanie ground truth (delegacja do store)
 * - Uruchamianie ewaluacji (single + batch)
 * - Obliczanie metryk (IoU, accuracy, timing diffs)
 * - Dopasowywanie segmentów GT ↔ predicted
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { transcriptionEvalStore } from './transcription-eval-store';
import { whisperWrapperService } from './whisper-wrapper-service';
import type {
  TranscriptionBackend,
  TranscriptionEvalOptions,
  TranscriptionEvalResult,
  TranscriptionEvalRun,
  TranscriptionEvalJob,
  TranscriptionEvalStatus,
  GroundTruthSegment,
  TranscriptionSegmentOutput,
  SegmentMatch,
  GroundTruthSegmentInput,
  TranscriptionAssetConfig,
} from '../types/transcription-eval';

// ============================================================================
// METRICS COMPUTATION
// ============================================================================

/**
 * Oblicza Intersection over Union dla dwóch interwałów czasowych [startA, endA] i [startB, endB]
 */
function computeIoU(startA: number, endA: number, startB: number, endB: number): number {
  const intersectionStart = Math.max(startA, startB);
  const intersectionEnd = Math.min(endA, endB);
  const intersection = Math.max(0, intersectionEnd - intersectionStart);

  const union = (endA - startA) + (endB - startB) - intersection;
  if (union <= 0) return 0;

  return intersection / union;
}

/**
 * Proste porównanie tekstu - Levenshtein distance normalized
 */
function computeTextSimilarity(textA: string, textB: string): number {
  const a = textA.toLowerCase().trim();
  const b = textB.toLowerCase().trim();

  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  // Jaccard na słowach (szybsze niż Levenshtein, wystarczające dla ewaluacji)
  const wordsA = new Set(a.split(/\s+/));
  const wordsB = new Set(b.split(/\s+/));
  const intersection = new Set([...wordsA].filter(w => wordsB.has(w)));
  const union = new Set([...wordsA, ...wordsB]);

  return intersection.size / union.size;
}

/**
 * Dopasowuje segmenty GT do predicted na podstawie najlepszego IoU (greedy matching)
 * IoU threshold: 0.1 (minimalny overlap aby uznać za match)
 */
function matchSegments(
  groundTruth: GroundTruthSegment[],
  predicted: TranscriptionSegmentOutput[],
  iouThreshold = 0.1
): SegmentMatch[] {
  const usedPredicted = new Set<number>();
  const matches: SegmentMatch[] = [];

  for (const gt of groundTruth) {
    let bestMatch: { index: number; iou: number; predicted: TranscriptionSegmentOutput } | null = null;

    for (let i = 0; i < predicted.length; i++) {
      if (usedPredicted.has(i)) continue;

      const iou = computeIoU(gt.startMs, gt.endMs, predicted[i].startMs, predicted[i].endMs);
      if (iou >= iouThreshold && (!bestMatch || iou > bestMatch.iou)) {
        bestMatch = { index: i, iou, predicted: predicted[i] };
      }
    }

    if (bestMatch) {
      usedPredicted.add(bestMatch.index);
      matches.push({
        groundTruth: gt,
        predicted: bestMatch.predicted,
        startDiffMs: bestMatch.predicted.startMs - gt.startMs,
        endDiffMs: bestMatch.predicted.endMs - gt.endMs,
        iou: bestMatch.iou,
        textSimilarity: computeTextSimilarity(gt.text, bestMatch.predicted.text),
        matched: true,
      });
    } else {
      matches.push({
        groundTruth: gt,
        predicted: null,
        startDiffMs: null,
        endDiffMs: null,
        iou: 0,
        textSimilarity: 0,
        matched: false,
      });
    }
  }

  return matches;
}

/**
 * Oblicza metryki zbiorcze z dopasowań segmentów
 */
function computeMetrics(matches: SegmentMatch[]): {
  avgStartDiffMs: number;
  avgEndDiffMs: number;
  maxStartDiffMs: number;
  maxEndDiffMs: number;
  matchPercentage: number;
  avgIoU: number;
} {
  const matchedSegments = matches.filter(m => m.matched);

  if (matchedSegments.length === 0) {
    return {
      avgStartDiffMs: 0,
      avgEndDiffMs: 0,
      maxStartDiffMs: 0,
      maxEndDiffMs: 0,
      matchPercentage: 0,
      avgIoU: 0,
    };
  }

  const startDiffs = matchedSegments.map(m => Math.abs(m.startDiffMs!));
  const endDiffs = matchedSegments.map(m => Math.abs(m.endDiffMs!));
  const ious = matches.map(m => m.iou);

  return {
    avgStartDiffMs: startDiffs.reduce((a, b) => a + b, 0) / startDiffs.length,
    avgEndDiffMs: endDiffs.reduce((a, b) => a + b, 0) / endDiffs.length,
    maxStartDiffMs: Math.max(...startDiffs),
    maxEndDiffMs: Math.max(...endDiffs),
    matchPercentage: (matchedSegments.length / matches.length) * 100,
    avgIoU: ious.reduce((a, b) => a + b, 0) / ious.length,
  };
}

// ============================================================================
// SERVICE
// ============================================================================

class TranscriptionEvalService extends EventEmitter {
  private jobs: Map<string, TranscriptionEvalJob> = new Map();

  // ==========================================================================
  // ASSET CONFIGS (delegacja do store)
  // ==========================================================================

  getAssetConfigs(): TranscriptionAssetConfig[] {
    return transcriptionEvalStore.getAssetConfigs();
  }

  getAssetConfig(assetId: string): TranscriptionAssetConfig | undefined {
    return transcriptionEvalStore.getAssetConfig(assetId);
  }

  upsertAssetConfig(config: Omit<TranscriptionAssetConfig, 'id' | 'createdDate'>): TranscriptionAssetConfig {
    return transcriptionEvalStore.upsertAssetConfig(config);
  }

  deleteAssetConfig(assetId: string): boolean {
    return transcriptionEvalStore.deleteAssetConfig(assetId);
  }

  // ==========================================================================
  // GROUND TRUTH (delegacja do store)
  // ==========================================================================

  getGroundTruth(assetId: string): GroundTruthSegment[] {
    return transcriptionEvalStore.getGroundTruth(assetId);
  }

  createGroundTruthSegment(input: GroundTruthSegmentInput): GroundTruthSegment {
    return transcriptionEvalStore.createGroundTruthSegment(input);
  }

  updateGroundTruthSegment(id: string, input: Partial<GroundTruthSegmentInput>): GroundTruthSegment | undefined {
    return transcriptionEvalStore.updateGroundTruthSegment(id, input);
  }

  deleteGroundTruthSegment(id: string): boolean {
    return transcriptionEvalStore.deleteGroundTruthSegment(id);
  }

  importGroundTruth(assetId: string, segments: GroundTruthSegmentInput[]): GroundTruthSegment[] {
    return transcriptionEvalStore.importGroundTruth(assetId, segments);
  }

  exportGroundTruth(assetId: string) {
    return transcriptionEvalStore.exportGroundTruth(assetId);
  }

  getAssetsWithGroundTruth() {
    return transcriptionEvalStore.getAssetsWithGroundTruth();
  }

  // ==========================================================================
  // EVAL RUNS (delegacja do store)
  // ==========================================================================

  getEvalRuns(limit = 50): TranscriptionEvalRun[] {
    return transcriptionEvalStore.getEvalRuns(limit);
  }

  getEvalRun(id: string): TranscriptionEvalRun | undefined {
    return transcriptionEvalStore.getEvalRun(id);
  }

  getEvalResult(id: string): TranscriptionEvalResult | undefined {
    return transcriptionEvalStore.getEvalResult(id);
  }

  getAssetResultHistory(assetId: string, limit = 20): TranscriptionEvalResult[] {
    return transcriptionEvalStore.getAssetResultHistory(assetId, limit);
  }

  deleteEvalRun(id: string): boolean {
    return transcriptionEvalStore.deleteEvalRun(id);
  }

  // ==========================================================================
  // BACKEND STATUS
  // ==========================================================================

  async checkBackends() {
    return whisperWrapperService.checkAllBackends();
  }

  // ==========================================================================
  // RUN EVALUATION
  // ==========================================================================

  /**
   * Uruchom ewaluację dla jednego lub wielu assetów
   */
  async runEvaluation(params: {
    assetIds: string[];
    backend: TranscriptionBackend;
    language: string;
    options?: TranscriptionEvalOptions;
    label?: string;
  }): Promise<TranscriptionEvalJob> {
    const { assetIds, backend, language, options = {}, label } = params;

    // Walidacja - sprawdź czy assety mają ground truth i config
    for (const assetId of assetIds) {
      const gt = this.getGroundTruth(assetId);
      if (gt.length === 0) {
        throw new Error(`No ground truth found for asset: ${assetId}`);
      }
      const config = this.getAssetConfig(assetId);
      if (!config) {
        throw new Error(`No audio config found for asset: ${assetId}. Add audio file path first.`);
      }
    }

    // Utwórz eval run
    const evalRun = transcriptionEvalStore.createEvalRun({
      label,
      backend,
      language,
      assetIds,
    });

    // Utwórz job
    const jobId = uuidv4();
    const job: TranscriptionEvalJob = {
      jobId,
      evalRunId: evalRun.id,
      status: 'pending',
      completedAssets: 0,
      totalAssets: assetIds.length,
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Uruchom asynchronicznie
    this.executeEvaluation(jobId, evalRun.id, assetIds, backend, language, options).catch(error => {
      const currentJob = this.jobs.get(jobId);
      if (currentJob) {
        currentJob.status = 'error';
        currentJob.error = error instanceof Error ? error.message : String(error);
      }
      transcriptionEvalStore.updateEvalRunStatus(evalRun.id, 'error');
      this.emit('eval:error', { jobId, error: currentJob?.error });
    });

    return job;
  }

  private async executeEvaluation(
    jobId: string,
    evalRunId: string,
    assetIds: string[],
    backend: TranscriptionBackend,
    language: string,
    options: TranscriptionEvalOptions
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'running';
    transcriptionEvalStore.updateEvalRunStatus(evalRunId, 'running');
    this.emit('eval:start', { jobId, evalRunId });

    for (const assetId of assetIds) {
      job.currentAssetId = assetId;
      this.emit('eval:progress', { jobId, assetId, completedAssets: job.completedAssets, totalAssets: job.totalAssets });

      try {
        const result = await this.evaluateAsset(evalRunId, assetId, backend, language, options);
        transcriptionEvalStore.saveEvalResult(result);

        job.completedAssets++;
        this.emit('eval:asset-complete', { jobId, assetId, result });
      } catch (error) {
        console.error(`[TranscriptionEval] Error evaluating asset ${assetId}:`, error);
        job.completedAssets++;
        // Kontynuuj z następnym assetem
      }

      transcriptionEvalStore.updateEvalRunStatus(evalRunId, 'running', job.completedAssets);
    }

    job.status = 'completed';
    job.completedAt = new Date().toISOString();
    job.currentAssetId = undefined;
    transcriptionEvalStore.updateEvalRunStatus(evalRunId, 'completed', job.completedAssets);
    this.emit('eval:complete', { jobId, evalRunId });
  }

  private async evaluateAsset(
    evalRunId: string,
    assetId: string,
    backend: TranscriptionBackend,
    language: string,
    options: TranscriptionEvalOptions
  ): Promise<TranscriptionEvalResult> {
    const config = this.getAssetConfig(assetId)!;
    const groundTruth = this.getGroundTruth(assetId);

    console.log(`[TranscriptionEval] Evaluating asset ${assetId} with ${backend} (${groundTruth.length} GT segments)`);

    // 1. Transkrybuj
    const output = await whisperWrapperService.transcribe(
      config.audioFilePath,
      backend,
      language,
      options
    );

    // 2. Dopasuj segmenty GT ↔ predicted
    const segmentMatches = matchSegments(groundTruth, output.segments);

    // 3. Oblicz metryki
    const metrics = computeMetrics(segmentMatches);

    // 4. Zbuduj wynik
    const result: TranscriptionEvalResult = {
      id: uuidv4(),
      evalRunId,
      assetId,
      backend,
      language,
      options,
      ...metrics,
      totalGroundTruthSegments: groundTruth.length,
      totalPredictedSegments: output.segments.length,
      segmentMatches,
      predictedSegments: output.segments,
      transcriptionDurationMs: output.durationMs,
      createdDate: new Date().toISOString(),
    };

    return result;
  }

  // ==========================================================================
  // JOB STATUS
  // ==========================================================================

  getJob(jobId: string): TranscriptionEvalJob | undefined {
    return this.jobs.get(jobId);
  }
}

// Singleton
export const transcriptionEvalService = new TranscriptionEvalService();
