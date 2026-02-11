/**
 * Composition Test Service
 *
 * Buduje minimalną strukturę chapter/timeline/block i renderuje kompozycje
 * jako pełne video MP4 na podstawie fixtures.
 */

import path from 'path';
import fs from 'fs';
import { spawn as spawnProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter } from 'events';
import { initializeElectronEnvWithPath } from '../../../desktop-app/electron/utils/electronEnv';
import { JsonStorage } from '../../agent-evals/storage/json-storage';
import { storageRegistry } from '../../../desktop-app/shared/storage';
import type { Block, Project, Chapter, Timeline, ProjectExportConfig } from '../../../desktop-app/shared/types';
import type { ChapterProgressCallback } from '../../../desktop-app/electron/services/RemotionExportService';
import type { CompositionTestFixture, CompositionRenderJob, CompositionBatchJob, RenderEngine } from '../../composition-tests/types';
import { getAllFixtures, getFixtureById, getFixturesByDefinitionId } from '../../composition-tests/fixtures';

// Inicjalizuj ścieżkę root projektu
const PROJECT_ROOT = path.resolve(__dirname, '../../../desktop-app');
initializeElectronEnvWithPath(PROJECT_ROOT);

// ============================================================================
// PATHS
// ============================================================================

const RENDERS_OUTPUT_DIR = path.resolve(__dirname, '../../agent-evals/results/composition-renders');
const RENDERS_PUPPETEER_DIR = path.resolve(__dirname, '../../agent-evals/results/composition-renders-puppeteer');

// ============================================================================
// SERVICE
// ============================================================================

class CompositionTestService extends EventEmitter {
  private jobs: Map<string, CompositionRenderJob> = new Map();
  private batches: Map<string, CompositionBatchJob> = new Map();

  constructor() {
    super();
    if (!fs.existsSync(RENDERS_OUTPUT_DIR)) {
      fs.mkdirSync(RENDERS_OUTPUT_DIR, { recursive: true });
    }
    if (!fs.existsSync(RENDERS_PUPPETEER_DIR)) {
      fs.mkdirSync(RENDERS_PUPPETEER_DIR, { recursive: true });
    }
  }

  // ==========================================================================
  // FIXTURES
  // ==========================================================================

  getFixtures(): CompositionTestFixture[] {
    return getAllFixtures();
  }

  getFixturesByDefinition(definitionId: string): CompositionTestFixture[] {
    return getFixturesByDefinitionId(definitionId);
  }

  getFixture(fixtureId: string): CompositionTestFixture | undefined {
    return getFixtureById(fixtureId);
  }

  // ==========================================================================
  // BUILD MINIMAL CHAPTER DATA
  // ==========================================================================

  /**
   * Buduje minimalną strukturę danych do renderowania pojedynczej kompozycji.
   * Tworzy Project, Chapter, Timeline (overlay) i Block (composition).
   */
  private buildMinimalChapterData(fixture: CompositionTestFixture): {
    project: Project;
    chapter: Chapter;
    timelines: Timeline[];
    blocks: Block[];
  } {
    const projectId = `comp-test-project-${fixture.id}`;
    const chapterId = `comp-test-chapter-${fixture.id}`;
    const timelineId = `comp-test-timeline-${fixture.id}`;
    const blockId = `comp-test-block-${fixture.id}`;
    const now = new Date().toISOString();

    // Buduj blockSettings z prefixem 'composition.props.'
    const blockSettings: Record<string, unknown> = {
      'composition.definitionId': fixture.compositionDefinitionId,
    };
    for (const [key, value] of Object.entries(fixture.props)) {
      blockSettings[`composition.props.${key}`] = value;
    }

    const project: Project = {
      id: projectId,
      name: `Composition Test: ${fixture.variantName}`,
      createdDate: now,
      lastModified: now,
      projectSettings: {
        fps: String(fixture.fps),
        width: String(fixture.width),
        height: String(fixture.height),
      },
    };

    const chapter: Chapter = {
      id: chapterId,
      projectId,
      title: fixture.variantName,
      templateId: 'default',
      orderIndex: 0,
      createdDate: now,
      modifiedDate: now,
    };

    const timeline: Timeline = {
      id: timelineId,
      chapterId,
      type: 'overlay',
      label: 'Overlay',
      orderIndex: 0,
      createdDate: now,
      modifiedDate: now,
      timelineSettings: {},
    };

    const block: Block = {
      id: blockId,
      timelineId,
      blockType: 'composition',
      mediaAssetId: undefined,
      timelineOffsetInFrames: 0,
      fileRelativeStartFrame: 0,
      fileRelativeEndFrame: fixture.durationInFrames,
      orderIndex: 0,
      createdDate: now,
      modifiedDate: now,
      blockSettings,
      focusPoints: [],
      transcriptionSegments: [],
      faces: [],
    };

    return {
      project,
      chapter,
      timelines: [timeline],
      blocks: [block],
    };
  }

  // ==========================================================================
  // RENDER SINGLE
  // ==========================================================================

  /**
   * Renderuje pojedynczą kompozycję z fixture'a do pliku MP4
   */
  async renderComposition(fixtureId: string, engine: RenderEngine = 'remotion', useBackgroundVideo?: boolean, debug?: boolean): Promise<CompositionRenderJob> {
    const fixture = this.getFixture(fixtureId);
    if (!fixture) {
      throw new Error(`Fixture not found: ${fixtureId}`);
    }

    // Background video wymusza puppeteer (WebCodecs feature)
    if (useBackgroundVideo) {
      engine = 'puppeteer';
    }

    const jobId = uuidv4();
    const job: CompositionRenderJob = {
      jobId,
      fixtureId,
      compositionDefinitionId: fixture.compositionDefinitionId,
      variantName: fixture.variantName,
      status: 'pending',
      progress: 0,
      startedAt: new Date().toISOString(),
      engine,
      useBackgroundVideo,
    };

    this.jobs.set(jobId, job);

    // Renderuj asynchronicznie
    const renderFn = engine === 'puppeteer'
      ? this.executePuppeteerRender(jobId, fixture, useBackgroundVideo, debug)
      : this.executeRender(jobId, fixture);

    renderFn.catch((error) => {
      const currentJob = this.jobs.get(jobId);
      if (currentJob) {
        currentJob.status = 'error';
        currentJob.error = error instanceof Error ? error.message : String(error);
        this.emit('render:error', { jobId, error: currentJob.error });
      }
    });

    return job;
  }

  private async executeRender(jobId: string, fixture: CompositionTestFixture): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const startTime = Date.now();
    console.log(`[CompositionTestService] Starting render job ${jobId} for fixture ${fixture.id}`);

    // 1. Buduj minimalną strukturę danych
    const { project, chapter, timelines, blocks } = this.buildMinimalChapterData(fixture);

    // 2. Inicjalizuj JsonStorage + StorageRegistry
    const jsonStorage = new JsonStorage();
    jsonStorage._getProjects().set(project.id, project);
    jsonStorage._getChapters().set(chapter.id, chapter);
    for (const t of timelines) {
      jsonStorage._getTimelines().set(t.id, t);
    }
    for (const b of blocks) {
      jsonStorage._getBlocks().set(b.id, b);
    }

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

    console.log('[CompositionTestService] Initialized StorageRegistry');

    try {
      // 3. Export config
      const exportConfig: ProjectExportConfig = {
        codec: 'h264',
        quality: 'medium',
        frameRange: null,
      };

      // 4. Output path - użyj fixtureId jako nazwy pliku
      const outputPath = path.join(RENDERS_OUTPUT_DIR, `${fixture.id}.mp4`);
      job.outputPath = outputPath;

      // 5. Progress callback
      const onProgress: ChapterProgressCallback = (progress) => {
        job.progress = progress.progress;

        if (progress.status === 'rendering') {
          job.status = 'rendering';
        } else if (progress.status === 'encoding') {
          job.status = 'encoding';
        }

        this.emit('render:progress', {
          jobId,
          fixtureId: fixture.id,
          progress: progress.progress,
          status: progress.status,
        });
      };

      // 6. Renderuj
      console.log('[CompositionTestService] Starting Remotion export...');
      job.status = 'rendering';
      this.emit('render:start', { jobId, fixtureId: fixture.id });

      const { remotionExportService } = await import('../../../desktop-app/electron/services/RemotionExportService');

      await remotionExportService.exportChapter(
        chapter,
        timelines,
        blocks,
        project,
        exportConfig,
        outputPath,
        onProgress
      );

      // 7. Zakończ
      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.renderDurationMs = Date.now() - startTime;

      console.log(`[CompositionTestService] Render job ${jobId} completed in ${job.renderDurationMs}ms: ${outputPath}`);
      this.emit('render:complete', { jobId, fixtureId: fixture.id, outputPath });
    } finally {
      storageRegistry.resetToDefaults();
      console.log('[CompositionTestService] StorageRegistry reset to defaults');
    }
  }

  // ==========================================================================
  // PUPPETEER RENDER
  // ==========================================================================

  private async executePuppeteerRender(jobId: string, fixture: CompositionTestFixture, useBackgroundVideo?: boolean, debug?: boolean): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const startTime = Date.now();
    console.log(`[CompositionTestService] Starting Puppeteer render job ${jobId} for fixture ${fixture.id}${useBackgroundVideo ? ' (with background video)' : ''}`);

    try {
      job.status = 'rendering';
      this.emit('render:start', { jobId, fixtureId: fixture.id });

      const outputPath = path.join(RENDERS_PUPPETEER_DIR, `${fixture.id}.mp4`);
      job.outputPath = outputPath;

      const { puppeteerCompositionRenderer } = await import(
        '../../../desktop-app/electron/services/render-engine/PuppeteerCompositionRenderer'
      );

      const result = await puppeteerCompositionRenderer.renderComposition({
        compositionDefinitionId: fixture.compositionDefinitionId,
        props: fixture.props,
        width: fixture.width,
        height: fixture.height,
        fps: fixture.fps,
        durationInFrames: fixture.durationInFrames,
        outputPath,
        useDynamicLoading: true,
        debugMode: debug,
        backgroundVideo: useBackgroundVideo ? {
          filePath: await this.ensureSampleVideo(),
        } : undefined,
        onProgress: (progress) => {
          job.progress = progress;
          this.emit('render:progress', {
            jobId,
            fixtureId: fixture.id,
            progress,
            status: 'rendering',
          });
        },
      });

      job.status = 'completed';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      job.renderDurationMs = result.renderDurationMs;

      console.log(`[CompositionTestService] Puppeteer render job ${jobId} completed in ${job.renderDurationMs}ms: ${outputPath}`);
      this.emit('render:complete', { jobId, fixtureId: fixture.id, outputPath });
    } catch (error) {
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      console.error(`[CompositionTestService] Puppeteer render error:`, error);
      this.emit('render:error', { jobId, error: job.error });
    }
  }

  // ==========================================================================
  // SAMPLE VIDEO
  // ==========================================================================

  private async ensureSampleVideo(): Promise<string> {
    const assetsDir = path.resolve(__dirname, '../../assets');
    const videoPath = path.join(assetsDir, 'sample-background.mp4');

    if (fs.existsSync(videoPath)) {
      return videoPath;
    }

    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }

    await this.generateSampleVideo(videoPath);
    return videoPath;
  }

  private generateSampleVideo(outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-f', 'lavfi',
        '-i', 'testsrc2=size=1920x1080:rate=30:duration=20',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-y',
        outputPath,
      ];

      console.log(`[CompositionTestService] Generating sample video: ffmpeg ${args.join(' ')}`);

      const ffmpeg = spawnProcess('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

      let stderr = '';
      ffmpeg.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code: number) => {
        if (code === 0) {
          console.log(`[CompositionTestService] Sample video generated: ${outputPath}`);
          resolve();
        } else {
          reject(new Error(`FFmpeg sample video generation failed (code ${code}): ${stderr.slice(-500)}`));
        }
      });

      ffmpeg.on('error', (err: Error) => {
        reject(new Error(`FFmpeg spawn error: ${err.message}`));
      });
    });
  }

  // ==========================================================================
  // RENDER BATCH
  // ==========================================================================

  /**
   * Renderuje wiele fixtures sekwencyjnie
   */
  async renderBatch(definitionId?: string, engine: RenderEngine = 'remotion', useBackgroundVideo?: boolean): Promise<CompositionBatchJob> {
    const fixtures = definitionId
      ? this.getFixturesByDefinition(definitionId)
      : this.getFixtures();

    const batchId = uuidv4();
    const batch: CompositionBatchJob = {
      batchId,
      jobs: [],
      status: 'pending',
      completedCount: 0,
      totalCount: fixtures.length,
    };

    this.batches.set(batchId, batch);

    // Uruchom sekwencyjnie w tle
    this.executeBatch(batchId, fixtures, engine, useBackgroundVideo).catch((error) => {
      batch.status = 'error';
      console.error(`[CompositionTestService] Batch ${batchId} error:`, error);
    });

    return batch;
  }

  private async executeBatch(batchId: string, fixtures: CompositionTestFixture[], engine: RenderEngine = 'remotion', useBackgroundVideo?: boolean): Promise<void> {
    const batch = this.batches.get(batchId);
    if (!batch) return;

    batch.status = 'running';
    this.emit('batch:start', { batchId, totalCount: fixtures.length });

    for (const fixture of fixtures) {
      try {
        const job = await this.renderComposition(fixture.id, engine, useBackgroundVideo);
        batch.jobs.push(job);

        // Czekaj na zakończenie renderowania
        await this.waitForJob(job.jobId);

        batch.completedCount++;
        this.emit('batch:progress', {
          batchId,
          completedCount: batch.completedCount,
          totalCount: batch.totalCount,
          lastFixtureId: fixture.id,
        });
      } catch (error) {
        console.error(`[CompositionTestService] Batch render error for ${fixture.id}:`, error);
        batch.completedCount++;
      }
    }

    batch.status = 'completed';
    this.emit('batch:complete', { batchId, completedCount: batch.completedCount });
  }

  private waitForJob(jobId: string): Promise<void> {
    return new Promise((resolve) => {
      const check = () => {
        const job = this.jobs.get(jobId);
        if (!job || job.status === 'completed' || job.status === 'error') {
          resolve();
          return;
        }
        setTimeout(check, 500);
      };
      check();
    });
  }

  // ==========================================================================
  // JOB STATUS
  // ==========================================================================

  getJob(jobId: string): CompositionRenderJob | undefined {
    return this.jobs.get(jobId);
  }

  getBatch(batchId: string): CompositionBatchJob | undefined {
    return this.batches.get(batchId);
  }

  // ==========================================================================
  // RENDERS MANAGEMENT
  // ==========================================================================

  getRendersDir(engine: RenderEngine = 'remotion'): string {
    return engine === 'puppeteer' ? RENDERS_PUPPETEER_DIR : RENDERS_OUTPUT_DIR;
  }

  /**
   * Lista wyrenderowanych plików
   */
  getRenderedFiles(engine?: RenderEngine): Array<{ fixtureId: string; filePath: string; sizeBytes: number; engine: RenderEngine }> {
    const results: Array<{ fixtureId: string; filePath: string; sizeBytes: number; engine: RenderEngine }> = [];

    const scanDir = (dir: string, eng: RenderEngine) => {
      if (!fs.existsSync(dir)) return;
      for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith('.mp4')) continue;
        const filePath = path.join(dir, f);
        const stats = fs.statSync(filePath);
        results.push({
          fixtureId: f.replace('.mp4', ''),
          filePath,
          sizeBytes: stats.size,
          engine: eng,
        });
      }
    };

    if (!engine || engine === 'remotion') {
      scanDir(RENDERS_OUTPUT_DIR, 'remotion');
    }
    if (!engine || engine === 'puppeteer') {
      scanDir(RENDERS_PUPPETEER_DIR, 'puppeteer');
    }

    return results;
  }

  /**
   * Usuń wyrenderowany plik
   */
  deleteRender(fixtureId: string, engine: RenderEngine = 'remotion'): boolean {
    const dir = engine === 'puppeteer' ? RENDERS_PUPPETEER_DIR : RENDERS_OUTPUT_DIR;
    const filePath = path.join(dir, `${fixtureId}.mp4`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
}

// Singleton
export const compositionTestService = new CompositionTestService();
