/**
 * Fixtures Routes - API endpoints dla podglądu fixtures.db
 *
 * Endpointy tylko do odczytu - pozwalają przeglądać zawartość fixtures.db
 * Edycja fixtures odbywa się przez główną aplikację Clamka z CLAMKA_DATA_PATH
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

// Ścieżka do fixtures.db
const FIXTURES_DB_PATH = path.resolve(__dirname, '../../agent-evals/fixtures/clamka.db');

// ============================================================================
// TYPES
// ============================================================================

interface ProjectSummary {
  id: string;
  name: string;
  createdDate: string;
  lastModified: string;
  chaptersCount: number;
  mediaAssetsCount: number;
}

interface ChapterSummary {
  id: string;
  projectId: string;
  title: string;
  templateId: string;
  orderIndex: number;
  timelinesCount: number;
  blocksCount: number;
}

interface TimelineSummary {
  id: string;
  chapterId: string;
  type: string;
  label: string;
  orderIndex: number;
  blocksCount: number;
}

interface BlockSummary {
  id: string;
  timelineId: string;
  blockType: string;
  mediaAssetId: string | null;
  timelineOffsetInFrames: number;
  fileRelativeStartFrame: number;
  fileRelativeEndFrame: number | null;
  orderIndex: number;
}

interface MediaAssetSummary {
  id: string;
  projectId: string;
  mediaType: string;
  fileName: string;
  filePath: string;
  orderIndex: number | null;
}

// ============================================================================
// HELPERS
// ============================================================================

function checkFixturesDb(): { exists: boolean; path: string } {
  return {
    exists: fs.existsSync(FIXTURES_DB_PATH),
    path: FIXTURES_DB_PATH,
  };
}

// ============================================================================
// ROUTES
// ============================================================================

export default async function fixturesRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  /**
   * GET /api/fixtures/status - sprawdź czy fixtures.db istnieje
   */
  fastify.get('/fixtures/status', async (_request, reply) => {
    const status = checkFixturesDb();
    return reply.send({
      ...status,
      instructions: !status.exists
        ? 'Run main app with CLAMKA_DATA_PATH=testing/agent-evals/fixtures to create fixtures'
        : 'Fixtures database ready',
    });
  });

  /**
   * GET /api/fixtures/projects - lista projektów w fixtures.db
   */
  fastify.get('/fixtures/projects', async (_request, reply) => {
    const status = checkFixturesDb();
    if (!status.exists) {
      return reply.status(404).send({
        error: 'Fixtures database not found',
        path: status.path,
        instructions: 'Run main app with CLAMKA_DATA_PATH=testing/agent-evals/fixtures to create fixtures',
      });
    }

    const db = new Database(FIXTURES_DB_PATH, { readonly: true });

    try {
      const projects = db
        .prepare(
          `
        SELECT
          p.id,
          p.name,
          p.createdDate,
          p.lastModified,
          (SELECT COUNT(*) FROM chapters c WHERE c.projectId = p.id) as chaptersCount,
          (SELECT COUNT(*) FROM media_assets m WHERE m.projectId = p.id) as mediaAssetsCount
        FROM projects p
        ORDER BY p.lastModified DESC
      `
        )
        .all() as ProjectSummary[];

      return reply.send(projects);
    } finally {
      db.close();
    }
  });

  /**
   * GET /api/fixtures/projects/:projectId - szczegóły projektu
   */
  fastify.get<{ Params: { projectId: string } }>(
    '/fixtures/projects/:projectId',
    async (request, reply) => {
      const status = checkFixturesDb();
      if (!status.exists) {
        return reply.status(404).send({ error: 'Fixtures database not found' });
      }

      const db = new Database(FIXTURES_DB_PATH, { readonly: true });

      try {
        const project = db
          .prepare('SELECT * FROM projects WHERE id = ?')
          .get(request.params.projectId);

        if (!project) {
          return reply.status(404).send({ error: 'Project not found' });
        }

        // Pobierz settings projektu
        const settings = db
          .prepare('SELECT key, value FROM project_settings WHERE projectId = ?')
          .all(request.params.projectId) as { key: string; value: string }[];

        const settingsObj: Record<string, string> = {};
        for (const s of settings) {
          settingsObj[s.key] = s.value;
        }

        return reply.send({
          ...project,
          settings: settingsObj,
        });
      } finally {
        db.close();
      }
    }
  );

  /**
   * GET /api/fixtures/projects/:projectId/chapters - chaptery projektu
   */
  fastify.get<{ Params: { projectId: string } }>(
    '/fixtures/projects/:projectId/chapters',
    async (request, reply) => {
      const status = checkFixturesDb();
      if (!status.exists) {
        return reply.status(404).send({ error: 'Fixtures database not found' });
      }

      const db = new Database(FIXTURES_DB_PATH, { readonly: true });

      try {
        const chapters = db
          .prepare(
            `
          SELECT
            c.id,
            c.projectId,
            c.title,
            c.templateId,
            c.orderIndex,
            (SELECT COUNT(*) FROM timelines t WHERE t.chapterId = c.id) as timelinesCount,
            (SELECT COUNT(*) FROM blocks b
             JOIN timelines t ON b.timelineId = t.id
             WHERE t.chapterId = c.id) as blocksCount
          FROM chapters c
          WHERE c.projectId = ?
          ORDER BY c.orderIndex
        `
          )
          .all(request.params.projectId) as ChapterSummary[];

        return reply.send(chapters);
      } finally {
        db.close();
      }
    }
  );

  /**
   * GET /api/fixtures/chapters/:chapterId/timelines - timelines chaptera
   */
  fastify.get<{ Params: { chapterId: string } }>(
    '/fixtures/chapters/:chapterId/timelines',
    async (request, reply) => {
      const status = checkFixturesDb();
      if (!status.exists) {
        return reply.status(404).send({ error: 'Fixtures database not found' });
      }

      const db = new Database(FIXTURES_DB_PATH, { readonly: true });

      try {
        const timelines = db
          .prepare(
            `
          SELECT
            t.id,
            t.chapterId,
            t.type,
            t.label,
            t.orderIndex,
            (SELECT COUNT(*) FROM blocks b WHERE b.timelineId = t.id) as blocksCount
          FROM timelines t
          WHERE t.chapterId = ?
          ORDER BY t.orderIndex
        `
          )
          .all(request.params.chapterId) as TimelineSummary[];

        return reply.send(timelines);
      } finally {
        db.close();
      }
    }
  );

  /**
   * GET /api/fixtures/timelines/:timelineId/blocks - bloki timeline
   */
  fastify.get<{ Params: { timelineId: string } }>(
    '/fixtures/timelines/:timelineId/blocks',
    async (request, reply) => {
      const status = checkFixturesDb();
      if (!status.exists) {
        return reply.status(404).send({ error: 'Fixtures database not found' });
      }

      const db = new Database(FIXTURES_DB_PATH, { readonly: true });

      try {
        const blocks = db
          .prepare(
            `
          SELECT
            b.id,
            b.timelineId,
            b.blockType,
            b.mediaAssetId,
            b.timelineOffsetInFrames,
            b.fileRelativeStartFrame,
            b.fileRelativeEndFrame,
            b.orderIndex
          FROM blocks b
          WHERE b.timelineId = ?
          ORDER BY b.timelineOffsetInFrames
        `
          )
          .all(request.params.timelineId) as BlockSummary[];

        return reply.send(blocks);
      } finally {
        db.close();
      }
    }
  );

  /**
   * GET /api/fixtures/projects/:projectId/media-assets - media assets projektu
   */
  fastify.get<{ Params: { projectId: string } }>(
    '/fixtures/projects/:projectId/media-assets',
    async (request, reply) => {
      const status = checkFixturesDb();
      if (!status.exists) {
        return reply.status(404).send({ error: 'Fixtures database not found' });
      }

      const db = new Database(FIXTURES_DB_PATH, { readonly: true });

      try {
        const assets = db
          .prepare(
            `
          SELECT
            id,
            projectId,
            mediaType,
            fileName,
            filePath,
            orderIndex
          FROM media_assets
          WHERE projectId = ?
          ORDER BY orderIndex
        `
          )
          .all(request.params.projectId) as MediaAssetSummary[];

        return reply.send(assets);
      } finally {
        db.close();
      }
    }
  );

  /**
   * GET /api/fixtures/media-assets/:assetId - szczegóły media asset
   */
  fastify.get<{ Params: { assetId: string } }>(
    '/fixtures/media-assets/:assetId',
    async (request, reply) => {
      const status = checkFixturesDb();
      if (!status.exists) {
        return reply.status(404).send({ error: 'Fixtures database not found' });
      }

      const db = new Database(FIXTURES_DB_PATH, { readonly: true });

      try {
        const asset = db
          .prepare('SELECT * FROM media_assets WHERE id = ?')
          .get(request.params.assetId) as Record<string, unknown> | undefined;

        if (!asset) {
          return reply.status(404).send({ error: 'Media asset not found' });
        }

        // Parse JSON fields
        if (typeof asset.metadata === 'string') {
          try {
            asset.metadata = JSON.parse(asset.metadata);
          } catch {
            // Keep as string if not valid JSON
          }
        }
        if (typeof asset.typeSpecificData === 'string') {
          try {
            asset.typeSpecificData = JSON.parse(asset.typeSpecificData);
          } catch {
            // Keep as string if not valid JSON
          }
        }

        // Pobierz powiązane dane
        const focusPoints = db
          .prepare('SELECT * FROM media_asset_focus_points WHERE assetId = ? ORDER BY fileRelativeFrame')
          .all(request.params.assetId);
        const transcriptionSegments = db
          .prepare('SELECT * FROM media_asset_transcription_segments WHERE assetId = ? ORDER BY fileRelativeStartFrame')
          .all(request.params.assetId);
        const faces = db
          .prepare('SELECT * FROM media_asset_faces WHERE mediaAssetId = ?')
          .all(request.params.assetId);
        const scenes = db
          .prepare('SELECT * FROM media_asset_scenes WHERE mediaAssetId = ? ORDER BY orderIndex')
          .all(request.params.assetId);

        return reply.send({
          ...asset,
          focusPoints,
          transcriptionSegments,
          faces,
          scenes,
        });
      } finally {
        db.close();
      }
    }
  );
}
