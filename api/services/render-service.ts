/**
 * Render Service dla Testing Framework
 *
 * Renderuje chapter'y używając danych z SQLite fixtures + data_diff z evals.db.
 * Workflow:
 * 1. Ładuje fixtures z SQLite (stan początkowy)
 * 2. Pobiera data_diff z evals.db (zmiany wykonane przez agenta)
 * 3. Stosuje diff na fixtures → stan końcowy
 * 4. Wywołuje RemotionExportService
 */

import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { initializeElectronEnvWithPath } from '../../../desktop-app/electron/utils/electronEnv';
import { loadFixturesFromSqlite, type SqliteFixtureData } from './sqlite-fixture-loader';
import { getResultsStore } from './results-store';
import { JsonStorage } from '../../agent-evals/storage/json-storage';
import { storageRegistry } from '../../../desktop-app/shared/storage';
import type { Block, MediaAsset, Project, Chapter, Timeline, ProjectExportConfig } from '../../../desktop-app/shared/types';
import type { ChapterProgressCallback } from '../../../desktop-app/electron/services/RemotionExportService';

// Inicjalizuj ścieżkę root projektu - wymagane przed importem RemotionExportService
const PROJECT_ROOT = path.resolve(__dirname, '../../../desktop-app');
initializeElectronEnvWithPath(PROJECT_ROOT);

// ============================================================================
// PATHS
// ============================================================================

const FIXTURES_DB_PATH = path.resolve(__dirname, '../../agent-evals/fixtures/clamka.db');
const RENDERS_OUTPUT_DIR = path.resolve(__dirname, '../../agent-evals/results/renders');

// ============================================================================
// TYPES
// ============================================================================

export type RenderStatus = 'pending' | 'rendering' | 'encoding' | 'completed' | 'error';

export interface RenderJob {
  jobId: string;
  projectId: string;
  chapterId: string;
  status: RenderStatus;
  progress: number;
  currentFrame?: number;
  totalFrames?: number;
  previewFrame?: string;  // Base64 encoded JPEG
  outputPath?: string;
  error?: string;
  startedAt: string;
  completedAt?: string;
}

export interface RenderProgress {
  progress: number;
  currentFrame?: number;
  totalFrames?: number;
  previewFrame?: string;
  status?: 'rendering' | 'encoding' | 'success' | 'error';
}

// ============================================================================
// RENDER SERVICE
// ============================================================================

class RenderService extends EventEmitter {
  private jobs: Map<string, RenderJob> = new Map();

  constructor() {
    super();
    // Upewnij się, że katalog renders istnieje
    if (!fs.existsSync(RENDERS_OUTPUT_DIR)) {
      fs.mkdirSync(RENDERS_OUTPUT_DIR, { recursive: true });
    }
  }

  /**
   * Rozpocznij renderowanie chapter'a
   *
   * @param suiteId - ID suite run (do załadowania snapshot)
   * @param scenarioId - ID scenariusza (do załadowania snapshot)
   * @param projectId - ID projektu
   * @param chapterId - ID chaptera do wyrenderowania
   */
  async renderChapter(
    suiteId: string,
    scenarioId: string,
    projectId: string,
    chapterId: string
  ): Promise<RenderJob> {
    const jobId = uuidv4();

    // Utwórz job
    const job: RenderJob = {
      jobId,
      projectId,
      chapterId,
      status: 'pending',
      progress: 0,
      startedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, job);

    // Renderuj asynchronicznie
    this.executeRender(jobId, suiteId, scenarioId, projectId, chapterId).catch((error) => {
      const currentJob = this.jobs.get(jobId);
      if (currentJob) {
        currentJob.status = 'error';
        currentJob.error = error instanceof Error ? error.message : String(error);
        this.emit('render:error', { jobId, error: currentJob.error });
      }
    });

    return job;
  }

  /**
   * Pobierz status renderowania
   */
  getJob(jobId: string): RenderJob | undefined {
    return this.jobs.get(jobId);
  }

  /**
   * Usuń renderowanie (plik + job)
   */
  deleteRender(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) return false;

    // Usuń plik jeśli istnieje
    if (job.outputPath && fs.existsSync(job.outputPath)) {
      fs.unlinkSync(job.outputPath);
    }

    this.jobs.delete(jobId);
    return true;
  }

  /**
   * Pobierz ścieżkę do katalogu renderów
   */
  getRendersDir(): string {
    return RENDERS_OUTPUT_DIR;
  }

  /**
   * Wykonaj renderowanie
   */
  private async executeRender(
    jobId: string,
    suiteId: string,
    scenarioId: string,
    projectId: string,
    chapterId: string
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    console.log(`[RenderService] Starting render job ${jobId} for chapter ${chapterId}`);

    // 1. Załaduj fixtures z SQLite (stan początkowy)
    console.log('[RenderService] Loading fixtures from SQLite...');
    const fixtureData = await loadFixturesFromSqlite(projectId, chapterId, FIXTURES_DB_PATH);

    // 2. Pobierz data_diff z evals.db (zmiany wykonane przez agenta)
    console.log('[RenderService] Loading data_diff from evals.db...');
    const resultsStore = getResultsStore();
    const dataDiff = resultsStore.getScenarioDataDiff(suiteId, scenarioId);

    // 3. Zastosuj diff na fixtures → stan końcowy
    const finalData = this.applyDataDiff(fixtureData, dataDiff);
    console.log(`[RenderService] Applied data_diff: blocks=${finalData.blocks.length}, timelines=${finalData.timelines.length}`);

    // 4. Zainicjalizuj StorageRegistry z danymi z fixtures
    // RemotionExportService używa mediaAssetService.findById() wewnętrznie (do serwowania plików przez HTTP)
    const jsonStorage = new JsonStorage();
    this.loadDataToJsonStorage(jsonStorage, finalData);

    storageRegistry.setAll({
      project: jsonStorage.getProjectStorage(),
      chapter: jsonStorage.getChapterStorage(),
      timeline: jsonStorage.getTimelineStorage(),
      block: jsonStorage.getBlockStorage(),
      mediaAsset: jsonStorage.getMediaAssetStorage(),
      chat: jsonStorage.getChatStorage(),
      enrichment: jsonStorage.getEnrichmentStorage(),
      settings: jsonStorage.getSettingsStorage(),
      person: jsonStorage.getPersonStorage(),
      dynamicComposition: jsonStorage.getDynamicCompositionStorage(),
    });

    console.log('[RenderService] Initialized StorageRegistry with fixture data');

    try {
      // 5. Wyciągnij dane
      const project = finalData.project;
      const chapter = finalData.chapters.find(c => c.id === chapterId);
      if (!chapter) {
        throw new Error(`Chapter ${chapterId} not found in fixtures`);
      }

      // Pobierz timelines dla tego chaptera
      const timelines = finalData.timelines.filter(t => t.chapterId === chapterId);
      const timelineIds = new Set(timelines.map(t => t.id));

      // Pobierz bloki dla timeline'ów tego chaptera
      const blocks = finalData.blocks.filter(b => timelineIds.has(b.timelineId));

      // Pobierz wszystkie media assets
      const mediaAssets = finalData.mediaAssets;

      console.log(`[RenderService] Final data: ${timelines.length} timelines, ${blocks.length} blocks, ${mediaAssets.length} media assets`);

      // 6. Przygotuj project z projectSettings
      const projectWithSettings: Project = {
        id: project.id,
        name: project.name,
        createdDate: project.createdDate,
        lastModified: project.lastModified,
        projectSettings: project.projectSettings || project.settings || {},
      };

      // 7. Przygotuj timelines z timelineSettings
      const timelinesWithSettings: Timeline[] = timelines.map(t => ({
        ...t,
        timelineSettings: (t as { timelineSettings?: Record<string, string> }).timelineSettings || {},
      }));

      // 8. Enrichuj bloki o mediaAsset
      console.log('[RenderService] Enriching blocks with media assets...');
      const enrichedBlocks = this.enrichBlocksWithAssets(blocks, mediaAssets);

      console.log(`[RenderService] Enriched ${enrichedBlocks.length} blocks with media assets`);

      // 9. Przygotuj export config
      const exportConfig: ProjectExportConfig = {
        codec: 'h264',
        quality: 'medium',
        frameRange: null,
      };

      // 10. Ścieżka wyjściowa
      const outputPath = path.join(RENDERS_OUTPUT_DIR, `${jobId}.mp4`);
      job.outputPath = outputPath;

      // 11. Progress callback
      const onProgress: ChapterProgressCallback = (progress) => {
        job.progress = progress.progress;
        job.currentFrame = progress.currentFrame;
        job.totalFrames = progress.totalFrames;
        job.previewFrame = progress.previewFrame;

        if (progress.status === 'rendering') {
          job.status = 'rendering';
        } else if (progress.status === 'encoding') {
          job.status = 'encoding';
        }

        this.emit('render:progress', {
          jobId,
          progress: progress.progress,
          currentFrame: progress.currentFrame,
          totalFrames: progress.totalFrames,
          previewFrame: progress.previewFrame,
          status: progress.status,
        });
      };

      // 12. Wykonaj renderowanie
      console.log('[RenderService] Starting Remotion export...');
      job.status = 'rendering';
      this.emit('render:start', { jobId });

      // Dynamiczny import - remotionExportService wymaga zainicjalizowanego electronEnv
      const { remotionExportService } = await import('../../../desktop-app/electron/services/RemotionExportService');

      await remotionExportService.exportChapter(
        chapter,
        timelinesWithSettings,
        enrichedBlocks,
        projectWithSettings,
        exportConfig,
        outputPath,
        onProgress
      );

      // 13. Zakończ
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();

      console.log(`[RenderService] Render job ${jobId} completed: ${outputPath}`);
      this.emit('render:complete', { jobId, outputPath });
    } finally {
      // Przywróć domyślne storage (usuń tymczasowe JsonStorage)
      storageRegistry.resetToDefaults();
      console.log('[RenderService] StorageRegistry reset to defaults');
    }
  }

  /**
   * Zastosuj data_diff na fixtures, zwracając dane po modyfikacji
   */
  private applyDataDiff(
    fixtures: SqliteFixtureData,
    dataDiff: {
      blocks: {
        added: Array<{ id: string; data: Record<string, unknown> }>;
        modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
        deleted: Array<{ id: string; data: Record<string, unknown> }>;
      };
      timelines: {
        added: Array<{ id: string; data: Record<string, unknown> }>;
        modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
        deleted: Array<{ id: string; data: Record<string, unknown> }>;
      };
      mediaAssets: {
        added: Array<{ id: string; data: Record<string, unknown> }>;
        modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
        deleted: Array<{ id: string; data: Record<string, unknown> }>;
      };
    } | null
  ): SqliteFixtureData {
    // Jeśli brak diff, zwróć oryginalne fixtures
    if (!dataDiff) {
      console.log('[RenderService] No data_diff found, using original fixtures');
      return fixtures;
    }

    // Głęboka kopia fixtures
    const result: SqliteFixtureData = {
      project: { ...fixtures.project },
      chapters: fixtures.chapters.map(c => ({ ...c })),
      timelines: fixtures.timelines.map(t => ({ ...t })),
      blocks: fixtures.blocks.map(b => ({ ...b })),
      mediaAssets: fixtures.mediaAssets.map(a => ({ ...a })),
    };

    // Zastosuj zmiany bloków
    if (dataDiff.blocks) {
      // Dodaj nowe bloki
      for (const { id, data } of dataDiff.blocks.added) {
        result.blocks.push({
          id,
          timelineId: data.timelineId as string,
          blockType: data.blockType as string,
          mediaAssetId: data.mediaAssetId as string | undefined,
          timelineOffsetInFrames: data.timelineOffsetInFrames as number,
          fileRelativeStartFrame: data.fileRelativeStartFrame as number,
          fileRelativeEndFrame: data.fileRelativeEndFrame as number,
          orderIndex: data.orderIndex as number,
          createdDate: data.createdDate as string,
          modifiedDate: data.modifiedDate as string,
          blockSettings: (data.blockSettings as Record<string, unknown>) || {},
          focusPoints: [],
          transcriptionSegments: [],
          faces: [],
        });
      }

      // Zmodyfikuj istniejące bloki
      for (const { id, after } of dataDiff.blocks.modified) {
        const idx = result.blocks.findIndex(b => b.id === id);
        if (idx >= 0) {
          result.blocks[idx] = {
            ...result.blocks[idx],
            ...after,
            blockSettings: (after.blockSettings as Record<string, unknown>) || result.blocks[idx].blockSettings,
          } as typeof result.blocks[0];
        }
      }

      // Usuń bloki
      for (const { id } of dataDiff.blocks.deleted) {
        result.blocks = result.blocks.filter(b => b.id !== id);
      }

      console.log(`[RenderService] Applied block diff: +${dataDiff.blocks.added.length}, ~${dataDiff.blocks.modified.length}, -${dataDiff.blocks.deleted.length}`);
    }

    // Zastosuj zmiany timeline'ów
    if (dataDiff.timelines) {
      // Dodaj nowe timelines
      for (const { id, data } of dataDiff.timelines.added) {
        result.timelines.push({
          id,
          chapterId: data.chapterId as string,
          type: data.type as string,
          label: data.label as string,
          orderIndex: data.orderIndex as number,
          createdDate: data.createdDate as string,
          modifiedDate: data.modifiedDate as string,
          timelineSettings: (data.timelineSettings as Record<string, string>) || {},
        });
      }

      // Zmodyfikuj istniejące timelines
      for (const { id, after } of dataDiff.timelines.modified) {
        const idx = result.timelines.findIndex(t => t.id === id);
        if (idx >= 0) {
          result.timelines[idx] = {
            ...result.timelines[idx],
            ...after,
            timelineSettings: (after.timelineSettings as Record<string, string>) || result.timelines[idx].timelineSettings,
          } as typeof result.timelines[0];
        }
      }

      // Usuń timelines
      for (const { id } of dataDiff.timelines.deleted) {
        result.timelines = result.timelines.filter(t => t.id !== id);
      }

      console.log(`[RenderService] Applied timeline diff: +${dataDiff.timelines.added.length}, ~${dataDiff.timelines.modified.length}, -${dataDiff.timelines.deleted.length}`);
    }

    // Zastosuj zmiany mediaAssets
    if (dataDiff.mediaAssets) {
      // Dodaj nowe media assets
      for (const { id, data } of dataDiff.mediaAssets.added) {
        result.mediaAssets.push({
          id,
          projectId: data.projectId as string,
          mediaType: data.mediaType as 'video' | 'audio' | 'image' | 'pdf',
          mimeType: data.mimeType as string | undefined,
          fileName: data.fileName as string,
          filePath: data.filePath as string,
          orderIndex: data.orderIndex as number,
          addedDate: data.addedDate as string,
          metadata: (data.metadata as Record<string, unknown>) || {},
          typeSpecificData: (data.typeSpecificData as Record<string, unknown>) || {},
          focusPoints: [],
          transcriptionSegments: [],
          faces: [],
          scenes: [],
        });
      }

      // Zmodyfikuj istniejące media assets
      for (const { id, after } of dataDiff.mediaAssets.modified) {
        const idx = result.mediaAssets.findIndex(a => a.id === id);
        if (idx >= 0) {
          result.mediaAssets[idx] = {
            ...result.mediaAssets[idx],
            ...after,
          } as typeof result.mediaAssets[0];
        }
      }

      // Usuń media assets
      for (const { id } of dataDiff.mediaAssets.deleted) {
        result.mediaAssets = result.mediaAssets.filter(a => a.id !== id);
      }

      console.log(`[RenderService] Applied mediaAsset diff: +${dataDiff.mediaAssets.added.length}, ~${dataDiff.mediaAssets.modified.length}, -${dataDiff.mediaAssets.deleted.length}`);
    }

    return result;
  }

  /**
   * Enrichuj bloki o mediaAsset
   */
  private enrichBlocksWithAssets(
    blocks: Array<Block & { blockSettings?: Record<string, unknown> }>,
    mediaAssets: MediaAsset[]
  ): Block[] {
    return blocks.map(block => {
      const enrichedBlock: Block = {
        id: block.id,
        timelineId: block.timelineId,
        blockType: block.blockType,
        mediaAssetId: block.mediaAssetId,
        timelineOffsetInFrames: block.timelineOffsetInFrames,
        fileRelativeStartFrame: block.fileRelativeStartFrame,
        fileRelativeEndFrame: block.fileRelativeEndFrame,
        orderIndex: block.orderIndex,
        createdDate: block.createdDate,
        modifiedDate: block.modifiedDate,
        blockSettings: block.blockSettings || {},
        focusPoints: block.focusPoints || [],
        transcriptionSegments: block.transcriptionSegments || [],
        faces: block.faces || [],
      };

      if (block.mediaAssetId) {
        const asset = mediaAssets.find(a => a.id === block.mediaAssetId);
        if (asset) {
          // filePath w fixtures.db jest już absolutna - nie trzeba konwertować
          enrichedBlock.mediaAsset = asset;
        }
      }

      return enrichedBlock;
    });
  }

  /**
   * Ładuje dane z SqliteFixtureData do JsonStorage
   *
   * RemotionExportService używa mediaAssetService.findById() wewnętrznie
   * (do serwowania plików przez HTTP), który wymaga zainicjalizowanego StorageRegistry.
   */
  private loadDataToJsonStorage(storage: JsonStorage, data: SqliteFixtureData): void {
    // Załaduj projekt
    storage._getProjects().set(data.project.id, data.project);

    // Załaduj chaptery
    for (const chapter of data.chapters) {
      storage._getChapters().set(chapter.id, chapter);
    }

    // Załaduj timeline'y
    for (const timeline of data.timelines) {
      storage._getTimelines().set(timeline.id, timeline);
    }

    // Załaduj bloki
    for (const block of data.blocks) {
      storage._getBlocks().set(block.id, block);
    }

    // Załaduj media assets
    for (const asset of data.mediaAssets) {
      storage._getMediaAssets().set(asset.id, asset);
    }
  }
}

// Singleton
export const renderService = new RenderService();
