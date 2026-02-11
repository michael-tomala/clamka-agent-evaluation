/**
 * Typy dla systemu ewaluacji transkrypcji (Transcription Evaluation)
 *
 * Osobny system testowy (wzorzec Composition Tests), NIE część agent evals.
 * Porównuje wyniki transkrypcji (whisper-cpp, OpenAI, ElevenLabs) z ground truth.
 */

// ============================================================================
// BACKENDY TRANSKRYPCJI
// ============================================================================

export type TranscriptionBackend = 'whisper-cpp' | 'openai' | 'elevenlabs';

// ============================================================================
// GROUND TRUTH
// ============================================================================

/** Segment ground truth - ręcznie zanotowany referencyjny segment */
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

/** Input do tworzenia/edycji segmentu ground truth */
export interface GroundTruthSegmentInput {
  assetId: string;
  text: string;
  startMs: number;
  endMs: number;
  sourceFps: number;
  orderIndex: number;
  speakerId?: string | null;
}

// ============================================================================
// ASSET AUDIO CONFIG
// ============================================================================

/** Konfiguracja assetu audio dla ewaluacji - wskazuje na lokalny plik */
export interface TranscriptionAssetConfig {
  id: string;
  assetId: string;
  audioFilePath: string;
  sourceFps: number;
  language: string;
  label?: string;
  createdDate: string;
}

// ============================================================================
// SCENARIUSZ EWALUACJI
// ============================================================================

/** Scenariusz ewaluacji transkrypcji */
export interface TranscriptionEvalScenario {
  id: string;
  name: string;
  assetId: string;
  backend: TranscriptionBackend;
  language: string;
  options?: TranscriptionEvalOptions;
  thresholds?: TranscriptionEvalThresholds;
}

export interface TranscriptionEvalOptions {
  model?: string;
  enableVAD?: boolean;
  prompt?: string;
  temperature?: number;
  diarize?: boolean;
}

export interface TranscriptionEvalThresholds {
  maxStartDiffMs?: number;
  maxEndDiffMs?: number;
  minMatchPercentage?: number;
  minAvgIoU?: number;
}

// ============================================================================
// WYNIKI TRANSKRYPCJI (unified output z backendów)
// ============================================================================

export interface TranscriptionSegmentOutput {
  text: string;
  startMs: number;
  endMs: number;
  speakerId?: string | null;
}

export interface TranscriptionOutput {
  text: string;
  segments: TranscriptionSegmentOutput[];
  backend: TranscriptionBackend;
  durationMs: number;
}

// ============================================================================
// WYNIKI EWALUACJI
// ============================================================================

/** Dopasowanie pojedynczego segmentu GT do predicted */
export interface SegmentMatch {
  groundTruth: GroundTruthSegment;
  predicted: TranscriptionSegmentOutput | null;
  startDiffMs: number | null;
  endDiffMs: number | null;
  iou: number;
  textSimilarity: number;
  matched: boolean;
}

/** Wynik ewaluacji transkrypcji */
export interface TranscriptionEvalResult {
  id: string;
  evalRunId: string;
  assetId: string;
  backend: TranscriptionBackend;
  language: string;
  options: TranscriptionEvalOptions;

  // Metryki zbiorcze
  avgStartDiffMs: number;
  avgEndDiffMs: number;
  maxStartDiffMs: number;
  maxEndDiffMs: number;
  matchPercentage: number;
  avgIoU: number;
  totalGroundTruthSegments: number;
  totalPredictedSegments: number;

  // Szczegóły
  segmentMatches: SegmentMatch[];

  // Surowe dane
  predictedSegments: TranscriptionSegmentOutput[];
  transcriptionDurationMs: number;

  // Timestamps
  createdDate: string;
}

/** Run ewaluacji (grupa wyników z jednego uruchomienia) */
export interface TranscriptionEvalRun {
  id: string;
  label?: string;
  backend: TranscriptionBackend;
  language: string;
  assetIds: string[];
  status: TranscriptionEvalStatus;
  totalAssets: number;
  completedAssets: number;
  results: TranscriptionEvalResult[];
  createdDate: string;
  completedDate?: string;
}

export type TranscriptionEvalStatus = 'pending' | 'running' | 'completed' | 'error';

// ============================================================================
// JOB TRACKING
// ============================================================================

export interface TranscriptionEvalJob {
  jobId: string;
  evalRunId: string;
  status: TranscriptionEvalStatus;
  currentAssetId?: string;
  completedAssets: number;
  totalAssets: number;
  error?: string;
  startedAt: string;
  completedAt?: string;
}
