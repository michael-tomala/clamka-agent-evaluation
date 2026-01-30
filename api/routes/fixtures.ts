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
import type { Connection } from '@lancedb/lancedb';

// Ścieżka do fixtures.db
const FIXTURES_DB_PATH = path.resolve(__dirname, '../../agent-evals/fixtures/clamka.db');

// Ścieżka do LanceDB fixtures
const LANCEDB_FIXTURES_PATH = path.resolve(__dirname, '../../agent-evals/fixtures/lancedb');

// Tabele LanceDB z metadanymi
const LANCEDB_TABLES_CONFIG = {
  scene_embeddings: {
    displayName: 'Scene Embeddings',
    columns: ['id', 'projectId'],
  },
  project_contexts: {
    displayName: 'Project Contexts',
    columns: ['id', 'projectId', 'projectSettings', 'chunkIndex', 'text'],
  },
  transcription_embeddings: {
    displayName: 'Transcription Embeddings',
    columns: ['id', 'projectId', 'assetId', 'chunkIndex', 'text', 'segmentIds'],
  },
} as const;

// ============================================================================
// EMBEDDING SERVICE (dla semantic search)
// ============================================================================

type FeatureExtractionPipeline = (
  text: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array }>;

let embeddingPipeline: FeatureExtractionPipeline | null = null;
let embeddingInitPromise: Promise<void> | null = null;

async function getEmbedding(text: string): Promise<number[]> {
  if (!embeddingPipeline) {
    if (!embeddingInitPromise) {
      embeddingInitPromise = (async () => {
        console.log('[Fixtures] Initializing embedding model...');

        // Ustaw katalog cache dla modelu (w katalogu projektu)
        const cacheDir = path.resolve(__dirname, '../../../transformers-cache');
        process.env.TRANSFORMERS_CACHE = cacheDir;

        // Dynamiczny import @xenova/transformers (ESM module)
        const importFunc = new Function('modulePath', 'return import(modulePath)');
        const { pipeline, env } = await importFunc('@xenova/transformers');

        env.cacheDir = cacheDir;
        env.allowLocalModels = true;
        env.useBrowserCache = false;

        embeddingPipeline = (await pipeline(
          'feature-extraction',
          'Xenova/all-MiniLM-L6-v2',
          { quantized: true }
        )) as FeatureExtractionPipeline;

        console.log('[Fixtures] Embedding model initialized');
      })();
    }
    await embeddingInitPromise;
  }

  if (!embeddingPipeline) {
    throw new Error('Embedding pipeline not initialized');
  }

  const output = await embeddingPipeline(text, {
    pooling: 'mean',
    normalize: true,
  });

  // WAŻNE: zwracamy number[] zamiast Float32Array dla prawidłowej serializacji LanceDB
  return Array.from(new Float32Array(output.data));
}

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

// LanceDB types
interface LanceDbStatus {
  exists: boolean;
  path: string;
  tables: string[];
}

interface LanceDbProjectCount {
  projectId: string;
  count: number;
}

interface LanceDbTableStats {
  tableName: string;
  displayName: string;
  totalCount: number;
  byProject: LanceDbProjectCount[];
}

interface LanceDbSampleRecord {
  [key: string]: string | number | null;
}

interface LanceDbSearchResult {
  id: string;
  projectId: string;
  text?: string;
  score: number;
  distance: number;
}

interface LanceDbSearchRequest {
  query: string;
  projectId?: string;
  limit?: number;
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

function checkLanceDb(): { exists: boolean; path: string } {
  return {
    exists: fs.existsSync(LANCEDB_FIXTURES_PATH),
    path: LANCEDB_FIXTURES_PATH,
  };
}

// Cache dla połączenia LanceDB (read-only)
let lanceDbConnection: Connection | null = null;

async function getLanceDbConnection(): Promise<Connection | null> {
  const status = checkLanceDb();
  if (!status.exists) {
    return null;
  }

  if (!lanceDbConnection) {
    const lancedb = await import('@lancedb/lancedb');
    lanceDbConnection = await lancedb.connect(LANCEDB_FIXTURES_PATH);
  }

  return lanceDbConnection;
}

/**
 * Truncate text do określonej długości
 */
function truncateText(text: string | null | undefined, maxLength: number): string | null {
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
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

  // ============================================================================
  // LANCEDB ENDPOINTS
  // ============================================================================

  /**
   * GET /api/fixtures/lancedb/status - sprawdź status LanceDB fixtures
   */
  fastify.get('/fixtures/lancedb/status', async (_request, reply) => {
    const status = checkLanceDb();

    if (!status.exists) {
      return reply.send({
        exists: false,
        path: status.path,
        tables: [],
      } satisfies LanceDbStatus);
    }

    try {
      const db = await getLanceDbConnection();
      if (!db) {
        return reply.send({
          exists: false,
          path: status.path,
          tables: [],
        } satisfies LanceDbStatus);
      }

      const tableNames = await db.tableNames();

      return reply.send({
        exists: true,
        path: status.path,
        tables: tableNames,
      } satisfies LanceDbStatus);
    } catch (error) {
      console.error('[LanceDB] Error getting status:', error);
      return reply.status(500).send({
        error: 'Failed to connect to LanceDB',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/fixtures/lancedb/tables/:tableName/stats - statystyki tabeli
   */
  fastify.get<{ Params: { tableName: string } }>(
    '/fixtures/lancedb/tables/:tableName/stats',
    async (request, reply) => {
      const { tableName } = request.params;

      const tableConfig = LANCEDB_TABLES_CONFIG[tableName as keyof typeof LANCEDB_TABLES_CONFIG];
      if (!tableConfig) {
        return reply.status(404).send({
          error: `Unknown table: ${tableName}`,
          availableTables: Object.keys(LANCEDB_TABLES_CONFIG),
        });
      }

      try {
        const db = await getLanceDbConnection();
        if (!db) {
          return reply.status(404).send({ error: 'LanceDB not available' });
        }

        const tableNames = await db.tableNames();
        if (!tableNames.includes(tableName)) {
          return reply.send({
            tableName,
            displayName: tableConfig.displayName,
            totalCount: 0,
            byProject: [],
          } satisfies LanceDbTableStats);
        }

        const table = await db.openTable(tableName);
        const allRows = await table.query().toArray();

        // Grupuj po projectId
        const projectCounts = new Map<string, number>();
        for (const row of allRows) {
          const projectId = (row as { projectId?: string }).projectId || 'unknown';
          projectCounts.set(projectId, (projectCounts.get(projectId) || 0) + 1);
        }

        const byProject: LanceDbProjectCount[] = Array.from(projectCounts.entries())
          .map(([projectId, count]) => ({ projectId, count }))
          .sort((a, b) => b.count - a.count);

        return reply.send({
          tableName,
          displayName: tableConfig.displayName,
          totalCount: allRows.length,
          byProject,
        } satisfies LanceDbTableStats);
      } catch (error) {
        console.error(`[LanceDB] Error getting stats for ${tableName}:`, error);
        return reply.status(500).send({
          error: 'Failed to get table stats',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * GET /api/fixtures/lancedb/tables/:tableName/sample - sample rekordów z tabeli
   */
  fastify.get<{
    Params: { tableName: string };
    Querystring: { limit?: string; projectId?: string };
  }>(
    '/fixtures/lancedb/tables/:tableName/sample',
    async (request, reply) => {
      const { tableName } = request.params;
      const limit = Math.min(parseInt(request.query.limit || '10', 10), 100);
      const { projectId } = request.query;

      const tableConfig = LANCEDB_TABLES_CONFIG[tableName as keyof typeof LANCEDB_TABLES_CONFIG];
      if (!tableConfig) {
        return reply.status(404).send({
          error: `Unknown table: ${tableName}`,
          availableTables: Object.keys(LANCEDB_TABLES_CONFIG),
        });
      }

      try {
        const db = await getLanceDbConnection();
        if (!db) {
          return reply.status(404).send({ error: 'LanceDB not available' });
        }

        const tableNames = await db.tableNames();
        if (!tableNames.includes(tableName)) {
          return reply.send([]);
        }

        const table = await db.openTable(tableName);

        let query = table.query();
        if (projectId) {
          query = query.where(`"projectId" = '${projectId}'`);
        }

        const rows = await query.limit(limit).toArray();

        // Mapuj rekordy - usuń embedding, truncate text
        const mappedRows: LanceDbSampleRecord[] = rows.map((row) => {
          const record: LanceDbSampleRecord = {};

          for (const col of tableConfig.columns) {
            const value = (row as Record<string, unknown>)[col];

            if (col === 'text' && typeof value === 'string') {
              record[col] = truncateText(value, 200);
            } else if (col === 'segmentIds' && typeof value === 'string') {
              // Parse JSON array i pokaż liczbę elementów
              try {
                const parsed = JSON.parse(value);
                record[col] = Array.isArray(parsed) ? `[${parsed.length} segments]` : value;
              } catch {
                record[col] = value;
              }
            } else if (col === 'id' && typeof value === 'string' && value.length > 8) {
              // Skróć ID
              record[col] = value.substring(0, 8) + '...';
            } else {
              record[col] = value as string | number | null;
            }
          }

          return record;
        });

        return reply.send(mappedRows);
      } catch (error) {
        console.error(`[LanceDB] Error getting sample for ${tableName}:`, error);
        return reply.status(500).send({
          error: 'Failed to get table sample',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );

  /**
   * POST /api/fixtures/lancedb/tables/:tableName/search - wyszukiwanie semantyczne
   */
  fastify.post<{
    Params: { tableName: string };
    Body: LanceDbSearchRequest;
  }>(
    '/fixtures/lancedb/tables/:tableName/search',
    async (request, reply) => {
      const { tableName } = request.params;
      const { query, projectId, limit = 10 } = request.body;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return reply.status(400).send({ error: 'Query is required' });
      }

      const tableConfig = LANCEDB_TABLES_CONFIG[tableName as keyof typeof LANCEDB_TABLES_CONFIG];
      if (!tableConfig) {
        return reply.status(404).send({
          error: `Unknown table: ${tableName}`,
          availableTables: Object.keys(LANCEDB_TABLES_CONFIG),
        });
      }

      try {
        const db = await getLanceDbConnection();
        if (!db) {
          return reply.status(404).send({ error: 'LanceDB not available' });
        }

        const tableNames = await db.tableNames();
        if (!tableNames.includes(tableName)) {
          return reply.send({ results: [] });
        }

        // Wygeneruj embedding dla zapytania
        console.log(`[LanceDB] Generating embedding for query: "${query.substring(0, 50)}..."`);
        const queryEmbedding = await getEmbedding(query);

        // Otwórz tabelę i wykonaj vector search
        const table = await db.openTable(tableName);

        let searchQuery = table.vectorSearch(queryEmbedding).column('embedding');

        // Filtruj po projectId jeśli podano
        if (projectId) {
          searchQuery = searchQuery.where(`"projectId" = '${projectId}'`);
        }

        const rows = await searchQuery.limit(Math.min(limit, 50)).toArray();

        // Mapuj wyniki
        const results: LanceDbSearchResult[] = rows.map((row) => {
          const record = row as Record<string, unknown>;
          const distance = (record._distance as number) || 0;
          // Konwersja distance → score (im mniejszy distance, tym lepszy match)
          // Dla cosine distance: score = 1 - distance/2 (normalizuje do [0,1])
          const score = Math.max(0, 1 - distance / 2);

          return {
            id: (record.id as string) || '',
            projectId: (record.projectId as string) || '',
            text: truncateText(record.text as string | null | undefined, 300) || undefined,
            score: parseFloat(score.toFixed(3)),
            distance: parseFloat(distance.toFixed(4)),
          };
        });

        console.log(`[LanceDB] Search completed: ${results.length} results for table ${tableName}`);

        return reply.send({ results });
      } catch (error) {
        console.error(`[LanceDB] Error searching ${tableName}:`, error);
        return reply.status(500).send({
          error: 'Search failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  );
}
