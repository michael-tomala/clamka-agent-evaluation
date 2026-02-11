/**
 * Transcription Evals Routes - API endpoints dla systemu ewaluacji transkrypcji
 *
 * Endpoints:
 * - GET    /api/transcription-evals/backends                     - Status backendów
 * - GET    /api/transcription-evals/asset-configs                - Lista konfiguracji assetów
 * - POST   /api/transcription-evals/asset-configs                - Dodaj/aktualizuj config assetu
 * - DELETE /api/transcription-evals/asset-configs/:assetId       - Usuń config assetu
 * - GET    /api/transcription-evals/audio/:assetId               - Streamuj plik audio
 * - GET    /api/transcription-evals/ground-truth                 - Lista assetów z ground truth
 * - GET    /api/transcription-evals/ground-truth/:assetId        - Segmenty GT dla assetu
 * - POST   /api/transcription-evals/ground-truth                 - Utwórz segment GT
 * - PUT    /api/transcription-evals/ground-truth/:id             - Aktualizuj segment GT
 * - DELETE /api/transcription-evals/ground-truth/:id             - Usuń segment GT
 * - POST   /api/transcription-evals/ground-truth/:assetId/import - Import GT z JSON
 * - GET    /api/transcription-evals/ground-truth/:assetId/export - Export GT jako JSON
 * - POST   /api/transcription-evals/run                          - Uruchom ewaluację
 * - GET    /api/transcription-evals/jobs/:jobId                  - Status joba
 * - GET    /api/transcription-evals/runs                         - Lista eval runs
 * - GET    /api/transcription-evals/runs/:runId                  - Szczegóły run
 * - DELETE /api/transcription-evals/runs/:runId                  - Usuń run
 * - GET    /api/transcription-evals/results/:resultId            - Szczegóły wyniku
 * - GET    /api/transcription-evals/history/:assetId             - Historia wyników assetu
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fs from 'fs';
import path from 'path';
import { transcriptionEvalService } from '../services/transcription-eval-service';
import type {
  TranscriptionBackend,
  TranscriptionEvalOptions,
  GroundTruthSegmentInput,
} from '../types/transcription-eval';

// ============================================================================
// PARAM/BODY TYPES
// ============================================================================

interface AssetIdParams {
  assetId: string;
}

interface IdParams {
  id: string;
}

interface RunIdParams {
  runId: string;
}

interface JobIdParams {
  jobId: string;
}

interface ResultIdParams {
  resultId: string;
}

interface AssetConfigBody {
  assetId: string;
  audioFilePath: string;
  sourceFps?: number;
  language?: string;
  label?: string;
}

interface GroundTruthCreateBody {
  assetId: string;
  text: string;
  startMs: number;
  endMs: number;
  sourceFps: number;
  orderIndex: number;
  speakerId?: string;
}

interface GroundTruthUpdateBody {
  text?: string;
  startMs?: number;
  endMs?: number;
  sourceFps?: number;
  orderIndex?: number;
  speakerId?: string | null;
}

interface GroundTruthImportBody {
  segments: GroundTruthSegmentInput[];
}

interface RunEvalBody {
  assetIds: string[];
  backend: TranscriptionBackend;
  language?: string;
  options?: TranscriptionEvalOptions;
  label?: string;
}

interface RunsQuerystring {
  limit?: number;
}

interface HistoryQuerystring {
  limit?: number;
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function transcriptionEvalsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {

  // ==========================================================================
  // BACKENDS STATUS
  // ==========================================================================

  fastify.get('/transcription-evals/backends', async () => {
    return transcriptionEvalService.checkBackends();
  });

  // ==========================================================================
  // ASSET CONFIGS
  // ==========================================================================

  fastify.get('/transcription-evals/asset-configs', async () => {
    return transcriptionEvalService.getAssetConfigs();
  });

  fastify.post<{ Body: AssetConfigBody }>(
    '/transcription-evals/asset-configs',
    async (request, reply) => {
      const { assetId, audioFilePath, sourceFps = 30, language = 'pl', label } = request.body;

      if (!assetId || !audioFilePath) {
        return reply.status(400).send({ error: 'Missing required fields: assetId, audioFilePath' });
      }

      if (!fs.existsSync(audioFilePath)) {
        return reply.status(400).send({ error: `Audio file not found: ${audioFilePath}` });
      }

      const config = transcriptionEvalService.upsertAssetConfig({
        assetId,
        audioFilePath,
        sourceFps,
        language,
        label,
      });

      return reply.send(config);
    }
  );

  fastify.delete<{ Params: AssetIdParams }>(
    '/transcription-evals/asset-configs/:assetId',
    async (request, reply) => {
      const deleted = transcriptionEvalService.deleteAssetConfig(request.params.assetId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Asset config not found' });
      }
      return reply.send({ success: true });
    }
  );

  // ==========================================================================
  // AUDIO STREAMING
  // ==========================================================================

  fastify.get<{ Params: AssetIdParams }>(
    '/transcription-evals/audio/:assetId',
    async (request, reply) => {
      const config = transcriptionEvalService.getAssetConfig(request.params.assetId);
      if (!config) {
        return reply.status(404).send({ error: 'Asset config not found' });
      }

      if (!fs.existsSync(config.audioFilePath)) {
        return reply.status(404).send({ error: `Audio file not found: ${config.audioFilePath}` });
      }

      const stat = fs.statSync(config.audioFilePath);
      const ext = path.extname(config.audioFilePath).toLowerCase();

      const mimeTypes: Record<string, string> = {
        '.wav': 'audio/wav',
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.mkv': 'video/x-matroska',
        '.webm': 'video/webm',
      };

      const mimeType = mimeTypes[ext] || 'application/octet-stream';

      // Obsługa Range requests (wavesurfer.js potrzebuje)
      const range = request.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
        const chunkSize = end - start + 1;

        const stream = fs.createReadStream(config.audioFilePath, { start, end });

        return reply
          .status(206)
          .header('Content-Range', `bytes ${start}-${end}/${stat.size}`)
          .header('Accept-Ranges', 'bytes')
          .header('Content-Length', chunkSize)
          .type(mimeType)
          .send(stream);
      }

      const stream = fs.createReadStream(config.audioFilePath);
      return reply
        .header('Content-Length', stat.size)
        .header('Accept-Ranges', 'bytes')
        .type(mimeType)
        .send(stream);
    }
  );

  // ==========================================================================
  // GROUND TRUTH
  // ==========================================================================

  /** Lista assetów z ground truth */
  fastify.get('/transcription-evals/ground-truth', async () => {
    return transcriptionEvalService.getAssetsWithGroundTruth();
  });

  /** Segmenty GT dla assetu */
  fastify.get<{ Params: AssetIdParams }>(
    '/transcription-evals/ground-truth/:assetId',
    async (request) => {
      return transcriptionEvalService.getGroundTruth(request.params.assetId);
    }
  );

  /** Utwórz segment GT */
  fastify.post<{ Body: GroundTruthCreateBody }>(
    '/transcription-evals/ground-truth',
    async (request, reply) => {
      const { assetId, text, startMs, endMs, sourceFps, orderIndex, speakerId } = request.body;

      if (!assetId || text === undefined || startMs === undefined || endMs === undefined || !sourceFps) {
        return reply.status(400).send({ error: 'Missing required fields: assetId, text, startMs, endMs, sourceFps' });
      }

      const segment = transcriptionEvalService.createGroundTruthSegment({
        assetId,
        text,
        startMs,
        endMs,
        sourceFps,
        orderIndex: orderIndex ?? 0,
        speakerId,
      });

      return reply.status(201).send(segment);
    }
  );

  /** Aktualizuj segment GT */
  fastify.put<{ Params: IdParams; Body: GroundTruthUpdateBody }>(
    '/transcription-evals/ground-truth/:id',
    async (request, reply) => {
      const segment = transcriptionEvalService.updateGroundTruthSegment(request.params.id, request.body);
      if (!segment) {
        return reply.status(404).send({ error: 'Segment not found' });
      }
      return reply.send(segment);
    }
  );

  /** Usuń segment GT */
  fastify.delete<{ Params: IdParams }>(
    '/transcription-evals/ground-truth/:id',
    async (request, reply) => {
      const deleted = transcriptionEvalService.deleteGroundTruthSegment(request.params.id);
      if (!deleted) {
        return reply.status(404).send({ error: 'Segment not found' });
      }
      return reply.send({ success: true });
    }
  );

  /** Import ground truth z JSON */
  fastify.post<{ Params: AssetIdParams; Body: GroundTruthImportBody }>(
    '/transcription-evals/ground-truth/:assetId/import',
    async (request, reply) => {
      const { assetId } = request.params;
      const { segments } = request.body;

      if (!segments || !Array.isArray(segments)) {
        return reply.status(400).send({ error: 'Missing required field: segments (array)' });
      }

      const imported = transcriptionEvalService.importGroundTruth(assetId, segments);
      return reply.send({ imported: imported.length, segments: imported });
    }
  );

  /** Export ground truth jako JSON */
  fastify.get<{ Params: AssetIdParams }>(
    '/transcription-evals/ground-truth/:assetId/export',
    async (request) => {
      return transcriptionEvalService.exportGroundTruth(request.params.assetId);
    }
  );

  // ==========================================================================
  // EVALUATION
  // ==========================================================================

  /** Uruchom ewaluację */
  fastify.post<{ Body: RunEvalBody }>(
    '/transcription-evals/run',
    async (request, reply) => {
      const { assetIds, backend, language = 'pl', options, label } = request.body;

      if (!assetIds || assetIds.length === 0 || !backend) {
        return reply.status(400).send({ error: 'Missing required fields: assetIds, backend' });
      }

      try {
        const job = await transcriptionEvalService.runEvaluation({
          assetIds,
          backend,
          language,
          options,
          label,
        });

        return reply.send({
          jobId: job.jobId,
          evalRunId: job.evalRunId,
          status: job.status,
          totalAssets: job.totalAssets,
          message: `Evaluation started (${backend}, ${assetIds.length} assets)`,
        });
      } catch (error) {
        return reply.status(400).send({
          error: error instanceof Error ? error.message : 'Failed to start evaluation',
        });
      }
    }
  );

  /** Status joba ewaluacji */
  fastify.get<{ Params: JobIdParams }>(
    '/transcription-evals/jobs/:jobId',
    async (request, reply) => {
      const job = transcriptionEvalService.getJob(request.params.jobId);
      if (!job) {
        return reply.status(404).send({ error: 'Job not found' });
      }
      return reply.send(job);
    }
  );

  // ==========================================================================
  // EVAL RUNS & RESULTS
  // ==========================================================================

  /** Lista eval runs */
  fastify.get<{ Querystring: RunsQuerystring }>(
    '/transcription-evals/runs',
    async (request) => {
      const limit = request.query.limit || 50;
      return transcriptionEvalService.getEvalRuns(limit);
    }
  );

  /** Szczegóły eval run */
  fastify.get<{ Params: RunIdParams }>(
    '/transcription-evals/runs/:runId',
    async (request, reply) => {
      const run = transcriptionEvalService.getEvalRun(request.params.runId);
      if (!run) {
        return reply.status(404).send({ error: 'Eval run not found' });
      }
      return reply.send(run);
    }
  );

  /** Usuń eval run */
  fastify.delete<{ Params: RunIdParams }>(
    '/transcription-evals/runs/:runId',
    async (request, reply) => {
      const deleted = transcriptionEvalService.deleteEvalRun(request.params.runId);
      if (!deleted) {
        return reply.status(404).send({ error: 'Eval run not found' });
      }
      return reply.send({ success: true });
    }
  );

  /** Szczegóły wyniku */
  fastify.get<{ Params: ResultIdParams }>(
    '/transcription-evals/results/:resultId',
    async (request, reply) => {
      const result = transcriptionEvalService.getEvalResult(request.params.resultId);
      if (!result) {
        return reply.status(404).send({ error: 'Result not found' });
      }
      return reply.send(result);
    }
  );

  /** Historia wyników dla assetu */
  fastify.get<{ Params: AssetIdParams; Querystring: HistoryQuerystring }>(
    '/transcription-evals/history/:assetId',
    async (request) => {
      const limit = request.query.limit || 20;
      return transcriptionEvalService.getAssetResultHistory(request.params.assetId, limit);
    }
  );
}
