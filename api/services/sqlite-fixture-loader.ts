/**
 * SQLite Fixture Loader
 *
 * Wyodrębniona logika ładowania fixtures z SQLite do obsługi przez testing/api.
 * Ten plik musi znajdować się w testing/api/ aby używać better-sqlite3
 * skompilowanego dla Node.js (nie Electron).
 */

import Database from 'better-sqlite3';
import type {
  Project,
  Chapter,
  Timeline,
  Block,
  MediaAsset,
  MediaAssetFocusPoint,
  MediaAssetTranscriptionSegment,
  MediaAssetFace,
  MediaAssetScene,
} from '../../../desktop-app/shared/types';

// ============================================================================
// SQLITE ROW TYPES (dla typowania wyników zapytań)
// ============================================================================

interface SqliteProjectRow {
  id: string;
  name: string;
  createdDate: string;
  lastModified: string;
}

interface SqliteSettingRow {
  key: string;
  value: string;
  type?: string;
}

interface SqliteChapterRow {
  id: string;
  projectId: string;
  templateId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  durationInFrames: number;
  createdDate: string;
  modifiedDate: string;
  settings: string | null;
}

interface SqliteTimelineRow {
  id: string;
  chapterId: string;
  type: string;
  label: string;
  orderIndex: number;
  createdDate: string;
  modifiedDate: string;
}

interface SqliteBlockRow {
  id: string;
  timelineId: string;
  blockType: string;
  mediaAssetId: string | null;
  timelineOffsetInFrames: number;
  fileRelativeStartFrame: number;
  fileRelativeEndFrame: number | null;
  orderIndex: number;
  createdDate: string;
  modifiedDate: string;
}

interface SqliteMediaAssetRow {
  id: string;
  projectId: string;
  mediaType: string;
  mimeType: string | null;
  fileName: string;
  filePath: string;
  orderIndex: number | null;
  addedDate: string;
  metadata: string | null;
  typeSpecificData: string | null;
  waveformData: string | null;
  silenceData: string | null;
}

interface SqliteFocusPointRow {
  id: string;
  assetId: string;
  fileRelativeFrame: number;
  description: string;
  focusX: number | null;
  focusY: number | null;
  orderIndex: number;
  createdDate: string;
  modifiedDate: string;
}

interface SqliteTranscriptionSegmentRow {
  id: string;
  assetId: string;
  fileRelativeStartFrame: number;
  fileRelativeEndFrame: number;
  text: string;
  orderIndex: number;
  speakerId: string | null;
  personId: string | null;
  createdDate: string;
  modifiedDate: string;
}

interface SqliteFaceRow {
  id: string;
  mediaAssetId: string;
  personId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  embedding: string;
  confidence: number | null;
  fileRelativeStartFrame: number | null;
  fileRelativeEndFrame: number | null;
  positions: string | null;  // JSON array of FacePosition[]
  createdDate: string;
}

interface SqliteSceneRow {
  id: string;
  mediaAssetId: string;
  fileRelativeStartFrame: number;
  fileRelativeEndFrame: number;
  orderIndex: number;
  description: string | null;
  createdDate: string;
}

// ============================================================================
// RESULT TYPES
// ============================================================================

export interface SqliteFixtureData {
  project: Project & { settings?: Record<string, string> };
  chapters: Array<Chapter & { chapterSettings?: Record<string, string> }>;
  timelines: Array<Timeline & { timelineSettings?: Record<string, string> }>;
  blocks: Array<Block & { blockSettings?: Record<string, unknown> }>;
  mediaAssets: MediaAsset[];
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function settingsToObject(settings: SqliteSettingRow[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const setting of settings) {
    result[setting.key] = setting.value;
  }
  return result;
}

function mapFocusPoint(row: SqliteFocusPointRow): MediaAssetFocusPoint {
  return {
    id: row.id,
    assetId: row.assetId,
    fileRelativeFrame: row.fileRelativeFrame,
    description: row.description,
    focusX: row.focusX ?? undefined,
    focusY: row.focusY ?? undefined,
    orderIndex: row.orderIndex,
    createdDate: row.createdDate,
    modifiedDate: row.modifiedDate,
  };
}

function mapTranscriptionSegment(row: SqliteTranscriptionSegmentRow): MediaAssetTranscriptionSegment {
  return {
    id: row.id,
    assetId: row.assetId,
    fileRelativeStartFrame: row.fileRelativeStartFrame,
    fileRelativeEndFrame: row.fileRelativeEndFrame,
    text: row.text,
    orderIndex: row.orderIndex,
    speakerId: row.speakerId ?? undefined,
    personId: row.personId ?? undefined,
    createdDate: row.createdDate,
    modifiedDate: row.modifiedDate,
  };
}

function mapFace(row: SqliteFaceRow): MediaAssetFace {
  return {
    id: row.id,
    mediaAssetId: row.mediaAssetId,
    personId: row.personId,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    embedding: JSON.parse(row.embedding),
    confidence: row.confidence,
    fileRelativeStartFrame: row.fileRelativeStartFrame,
    fileRelativeEndFrame: row.fileRelativeEndFrame,
    positions: row.positions ? JSON.parse(row.positions) : null,
    createdDate: row.createdDate,
  };
}

function mapScene(row: SqliteSceneRow): MediaAssetScene {
  return {
    id: row.id,
    mediaAssetId: row.mediaAssetId,
    fileRelativeStartFrame: row.fileRelativeStartFrame,
    fileRelativeEndFrame: row.fileRelativeEndFrame,
    orderIndex: row.orderIndex,
    description: row.description ? JSON.parse(row.description) : null,
    createdDate: row.createdDate,
  };
}

// ============================================================================
// MAIN LOADER FUNCTION
// ============================================================================

/**
 * Ładuje dane z SQLite fixtures.db
 *
 * Workflow:
 * 1. Fixtures są tworzone w głównej aplikacji Clamka z CLAMKA_DATA_PATH=fixtures/
 * 2. Ta funkcja otwiera fixtures.db i zwraca dane
 * 3. JsonStorage używa tych danych do załadowania do pamięci
 *
 * @param projectId UUID projektu w fixtures.db
 * @param chapterId UUID chaptera (opcjonalnie - jeśli null, ładuje wszystkie chaptery)
 * @param fixturesDbPath Ścieżka do pliku fixtures.db
 * @returns Dane z fixtures (projekt, chaptery, timelines, bloki, media assets)
 */
export async function loadFixturesFromSqlite(
  projectId: string,
  chapterId: string | null,
  fixturesDbPath: string
): Promise<SqliteFixtureData> {
  const fs = await import('fs');

  if (!fs.existsSync(fixturesDbPath)) {
    throw new Error(`Fixtures database not found: ${fixturesDbPath}`);
  }

  const db = new Database(fixturesDbPath, { readonly: true });

  try {
    // 1. Załaduj projekt
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as SqliteProjectRow | undefined;
    if (!project) {
      throw new Error(`Project not found in fixtures.db: ${projectId}`);
    }

    const projectSettings = db.prepare('SELECT key, value, type FROM project_settings WHERE projectId = ?').all(projectId) as SqliteSettingRow[];
    const projectSettingsObj = settingsToObject(projectSettings);

    const projectData: Project & { settings?: Record<string, string> } = {
      id: project.id,
      name: project.name,
      createdDate: project.createdDate,
      lastModified: project.lastModified,
      projectSettings: projectSettingsObj,
      settings: projectSettingsObj,
    };
    console.log(`[SqliteFixtureLoader] Loaded project: ${project.name} (${project.id})`);

    // 2. Załaduj chaptery
    let chapters: SqliteChapterRow[];
    if (chapterId) {
      const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId) as SqliteChapterRow | undefined;
      if (!chapter) {
        throw new Error(`Chapter not found in fixtures.db: ${chapterId}`);
      }
      chapters = [chapter];
    } else {
      chapters = db.prepare('SELECT * FROM chapters WHERE projectId = ? ORDER BY orderIndex').all(projectId) as SqliteChapterRow[];
    }

    const chaptersData: Array<Chapter & { chapterSettings?: Record<string, string> }> = [];
    for (const chapter of chapters) {
      const chapterSettings = db.prepare('SELECT key, value, type FROM chapter_settings WHERE chapterId = ?').all(chapter.id) as SqliteSettingRow[];
      const chapterSettingsObj = settingsToObject(chapterSettings);

      chaptersData.push({
        id: chapter.id,
        projectId: chapter.projectId,
        templateId: chapter.templateId,
        title: chapter.title,
        description: chapter.description || undefined,
        orderIndex: chapter.orderIndex,
        durationInFrames: chapter.durationInFrames,
        createdDate: chapter.createdDate,
        modifiedDate: chapter.modifiedDate,
        chapterSettings: chapterSettingsObj,
      });
    }
    console.log(`[SqliteFixtureLoader] Loaded ${chaptersData.length} chapters`);

    // 3. Załaduj timelines dla chapterów
    const chapterIds = chapters.map(c => c.id);
    const timelinesQuery = chapterIds.length === 1
      ? db.prepare('SELECT * FROM timelines WHERE chapterId = ? ORDER BY orderIndex')
      : db.prepare(`SELECT * FROM timelines WHERE chapterId IN (${chapterIds.map(() => '?').join(',')}) ORDER BY orderIndex`);

    const timelines = (chapterIds.length === 1
      ? timelinesQuery.all(chapterIds[0])
      : timelinesQuery.all(...chapterIds)
    ) as SqliteTimelineRow[];

    const timelinesData: Array<Timeline & { timelineSettings?: Record<string, string> }> = [];
    for (const timeline of timelines) {
      const timelineSettings = db.prepare('SELECT key, value, type FROM timeline_settings WHERE timelineId = ?').all(timeline.id) as SqliteSettingRow[];
      const timelineSettingsObj = settingsToObject(timelineSettings);

      timelinesData.push({
        id: timeline.id,
        chapterId: timeline.chapterId,
        type: timeline.type,
        label: timeline.label,
        orderIndex: timeline.orderIndex,
        createdDate: timeline.createdDate,
        modifiedDate: timeline.modifiedDate,
        timelineSettings: timelineSettingsObj,
      });
    }
    console.log(`[SqliteFixtureLoader] Loaded ${timelinesData.length} timelines`);

    // 4. Załaduj bloki dla timeline'ów
    const timelineIds = timelines.map(t => t.id);
    const blocksData: Array<Block & { blockSettings?: Record<string, unknown> }> = [];

    if (timelineIds.length > 0) {
      const blocksQuery = timelineIds.length === 1
        ? db.prepare('SELECT * FROM blocks WHERE timelineId = ? ORDER BY timelineOffsetInFrames')
        : db.prepare(`SELECT * FROM blocks WHERE timelineId IN (${timelineIds.map(() => '?').join(',')}) ORDER BY timelineOffsetInFrames`);

      const blocks = (timelineIds.length === 1
        ? blocksQuery.all(timelineIds[0])
        : blocksQuery.all(...timelineIds)
      ) as SqliteBlockRow[];

      for (const block of blocks) {
        const blockSettings = db.prepare('SELECT key, value, type FROM block_settings WHERE blockId = ?').all(block.id) as SqliteSettingRow[];
        const blockSettingsObj = settingsToObject(blockSettings);

        blocksData.push({
          id: block.id,
          timelineId: block.timelineId,
          blockType: block.blockType,
          mediaAssetId: block.mediaAssetId || undefined,
          timelineOffsetInFrames: block.timelineOffsetInFrames,
          fileRelativeStartFrame: block.fileRelativeStartFrame,
          fileRelativeEndFrame: block.fileRelativeEndFrame ?? 0,
          orderIndex: block.orderIndex,
          createdDate: block.createdDate,
          modifiedDate: block.modifiedDate,
          blockSettings: blockSettingsObj,
          focusPoints: [],
          transcriptionSegments: [],
          faces: [],
        });
      }
      console.log(`[SqliteFixtureLoader] Loaded ${blocksData.length} blocks`);
    }

    // 5. Załaduj media assets dla projektu
    const mediaAssets = db.prepare('SELECT * FROM media_assets WHERE projectId = ?').all(projectId) as SqliteMediaAssetRow[];
    const mediaAssetsData: MediaAsset[] = [];

    for (const asset of mediaAssets) {
      // Pobierz powiązane dane (focus points, transcription, faces, scenes)
      const focusPoints = db.prepare('SELECT * FROM media_asset_focus_points WHERE assetId = ? ORDER BY fileRelativeFrame').all(asset.id) as SqliteFocusPointRow[];
      const transcriptionSegments = db.prepare('SELECT * FROM media_asset_transcription_segments WHERE assetId = ? ORDER BY fileRelativeStartFrame').all(asset.id) as SqliteTranscriptionSegmentRow[];
      const faces = db.prepare('SELECT * FROM media_asset_faces WHERE mediaAssetId = ?').all(asset.id) as SqliteFaceRow[];
      const scenes = db.prepare('SELECT * FROM media_asset_scenes WHERE mediaAssetId = ? ORDER BY orderIndex').all(asset.id) as SqliteSceneRow[];

      mediaAssetsData.push({
        id: asset.id,
        projectId: asset.projectId,
        mediaType: asset.mediaType as 'video' | 'audio' | 'image' | 'pdf',
        mimeType: asset.mimeType || undefined,
        fileName: asset.fileName,
        filePath: asset.filePath,
        orderIndex: asset.orderIndex ?? 0,
        addedDate: asset.addedDate,
        metadata: asset.metadata ? JSON.parse(asset.metadata) : {},
        typeSpecificData: asset.typeSpecificData ? JSON.parse(asset.typeSpecificData) : {},
        waveformData: asset.waveformData ? JSON.parse(asset.waveformData) : undefined,
        silenceData: asset.silenceData ? JSON.parse(asset.silenceData) : undefined,
        focusPoints: focusPoints.map(fp => mapFocusPoint(fp)),
        transcriptionSegments: transcriptionSegments.map(ts => mapTranscriptionSegment(ts)),
        faces: faces.map(f => mapFace(f)),
        scenes: scenes.map(s => mapScene(s)),
      });
    }
    console.log(`[SqliteFixtureLoader] Loaded ${mediaAssetsData.length} media assets`);

    return {
      project: projectData,
      chapters: chaptersData,
      timelines: timelinesData,
      blocks: blocksData,
      mediaAssets: mediaAssetsData,
    };

  } finally {
    db.close();
  }
}
