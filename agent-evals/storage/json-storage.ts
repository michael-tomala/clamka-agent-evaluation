/**
 * JSON Storage - implementacja storage dla testów agentów
 *
 * Przechowuje dane w pamięci (Map), pozwala na snapshot i diff.
 * Używany zamiast SQLite podczas testów.
 */

import { v4 as uuidv4 } from 'uuid';
import { loadFixturesFromSqlite } from '../../api/services/sqlite-fixture-loader';
import type {
  IProjectStorage,
  IChapterStorage,
  ITimelineStorage,
  IBlockStorage,
  IMediaAssetStorage,
  IChatStorage,
  IEnrichmentStorage,
  ISettingsStorage,
  IPersonStorage,
  IDynamicCompositionStorage,
} from '../../../shared/storage';
import { JsonChatStorage } from './json-chat-storage';
import { JsonEnrichmentStorage } from './json-enrichment-storage';
import { JsonSettingsStorage } from './json-settings-storage';
import { JsonPersonStorage } from './json-person-storage';
import { JsonDynamicCompositionStorage } from './json-dynamic-composition-storage';
import type {
  Project,
  RawProject,
  Chapter,
  RawChapter,
  Timeline,
  RawTimeline,
  Block,
  CreateBlockInput,
  UpdateBlockInput,
  MediaAsset,
  CreateMediaAssetInput,
} from '../../../shared/types';
import type { FixtureSet, DataDiff } from '../types/scenario';

// ============================================================================
// DATA SNAPSHOT
// ============================================================================

export interface DataSnapshot {
  projects: Map<string, Project>;
  chapters: Map<string, Chapter>;
  timelines: Map<string, Timeline>;
  blocks: Map<string, Block>;
  mediaAssets: Map<string, MediaAsset>;
  projectSettings: Map<string, Map<string, string>>;
  chapterSettings: Map<string, Map<string, string>>;
  timelineSettings: Map<string, Map<string, unknown>>;
  blockSettings: Map<string, Map<string, unknown>>;
}

// ============================================================================
// JSON STORAGE - Combined storage dla wszystkich encji
// ============================================================================

export class JsonStorage {
  private projects: Map<string, Project> = new Map();
  private chapters: Map<string, Chapter> = new Map();
  private timelines: Map<string, Timeline> = new Map();
  private blocks: Map<string, Block> = new Map();
  private mediaAssets: Map<string, MediaAsset> = new Map();

  private projectSettings: Map<string, Map<string, string>> = new Map();
  private chapterSettings: Map<string, Map<string, string>> = new Map();
  private timelineSettings: Map<string, Map<string, unknown>> = new Map();
  private blockSettings: Map<string, Map<string, unknown>> = new Map();

  // Storage instances (singleton)
  private chatStorage: JsonChatStorage | null = null;
  private enrichmentStorage: JsonEnrichmentStorage | null = null;
  private settingsStorage: JsonSettingsStorage | null = null;
  private personStorage: JsonPersonStorage | null = null;
  private dynamicCompositionStorage: JsonDynamicCompositionStorage | null = null;

  constructor() {}

  // ============================================================================
  // LOAD FIXTURES
  // ============================================================================

  async loadFromFixtures(fixtureSet: FixtureSet, fixturesBasePath: string): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    // Load project
    if (fixtureSet.project) {
      const projectPath = path.join(fixturesBasePath, 'projects', `${fixtureSet.project}.json`);
      if (fs.existsSync(projectPath)) {
        const projectData = JSON.parse(fs.readFileSync(projectPath, 'utf-8'));
        this.loadProject(projectData);
        console.log(`[JsonStorage] Loaded project: ${fixtureSet.project}`);
      } else {
        console.warn(`[JsonStorage] Fixture not found: ${projectPath}`);
      }
    }

    // Load chapter
    if (fixtureSet.chapter) {
      const chapterPath = path.join(fixturesBasePath, 'chapters', `${fixtureSet.chapter}.json`);
      if (fs.existsSync(chapterPath)) {
        const chapterData = JSON.parse(fs.readFileSync(chapterPath, 'utf-8'));
        this.loadChapter(chapterData);
        console.log(`[JsonStorage] Loaded chapter: ${fixtureSet.chapter}`);
      } else {
        console.warn(`[JsonStorage] Fixture not found: ${chapterPath}`);
      }
    }

    // Load timelines
    if (fixtureSet.timelines) {
      const timelinesPath = path.join(fixturesBasePath, 'timelines', `${fixtureSet.timelines}.json`);
      if (fs.existsSync(timelinesPath)) {
        const timelinesData = JSON.parse(fs.readFileSync(timelinesPath, 'utf-8'));
        this.loadTimelines(timelinesData);
        console.log(`[JsonStorage] Loaded timelines: ${fixtureSet.timelines}`);
      } else {
        console.warn(`[JsonStorage] Fixture not found: ${timelinesPath}`);
      }
    }

    // Load blocks
    if (fixtureSet.blocks) {
      const blocksPath = path.join(fixturesBasePath, 'blocks', `${fixtureSet.blocks}.json`);
      if (fs.existsSync(blocksPath)) {
        const blocksData = JSON.parse(fs.readFileSync(blocksPath, 'utf-8'));
        this.loadBlocks(blocksData);
        console.log(`[JsonStorage] Loaded blocks: ${fixtureSet.blocks}`);
      } else {
        console.warn(`[JsonStorage] Fixture not found: ${blocksPath}`);
      }
    }

    // Load media assets
    if (fixtureSet.mediaAssets) {
      const assetsPath = path.join(fixturesBasePath, 'media-assets', `${fixtureSet.mediaAssets}.json`);
      if (fs.existsSync(assetsPath)) {
        const assetsData = JSON.parse(fs.readFileSync(assetsPath, 'utf-8'));
        this.loadMediaAssets(assetsData);
        console.log(`[JsonStorage] Loaded media assets: ${fixtureSet.mediaAssets}`);
      } else {
        console.warn(`[JsonStorage] Fixture not found: ${assetsPath}`);
      }
    }
  }

  // ============================================================================
  // LOAD FROM SQLITE FIXTURES
  // ============================================================================

  /**
   * Ładuje dane z SQLite fixtures.db do pamięci (read-only)
   *
   * Deleguje do sqlite-fixture-loader.ts w testing/api/services/
   * który ma dostęp do better-sqlite3 skompilowanego dla Node.js.
   *
   * @param projectId UUID projektu w fixtures.db
   * @param chapterId UUID chaptera (opcjonalnie - jeśli null, ładuje wszystkie chaptery)
   * @param fixturesDbPath Ścieżka do pliku fixtures.db
   */
  async loadFromSqliteDb(
    projectId: string,
    chapterId: string | null,
    fixturesDbPath: string
  ): Promise<void> {
    // Deleguj do sqlite-fixture-loader.ts w testing/api/services/
    const fixtureData = await loadFixturesFromSqlite(projectId, chapterId, fixturesDbPath);

    // Załaduj dane do JsonStorage
    this.loadProject(fixtureData.project);

    for (const chapter of fixtureData.chapters) {
      this.loadChapter(chapter);
    }

    for (const timeline of fixtureData.timelines) {
      this.loadTimelines(timeline);
    }

    for (const block of fixtureData.blocks) {
      this.loadBlocks(block);
    }

    for (const asset of fixtureData.mediaAssets) {
      this.loadMediaAssets(asset);
    }

    // Połącz bloki z media assets (dodaj referencję mediaAsset do bloków)
    for (const [, block] of this.blocks) {
      if (block.mediaAssetId) {
        const asset = this.mediaAssets.get(block.mediaAssetId);
        if (asset) {
          block.mediaAsset = asset;
          // Kopiuj enrichment data z assetu do bloku
          block.focusPoints = asset.focusPoints || [];
          block.transcriptionSegments = asset.transcriptionSegments || [];
          block.faces = asset.faces || [];
        }
      }
    }

    console.log(`[JsonStorage] Loaded fixtures from SQLite via loader`);
  }

  private loadProject(data: Project & { settings?: Record<string, string> }): void {
    const { settings, ...project } = data;
    this.projects.set(project.id, {
      ...project,
      projectSettings: settings || {},
    });
    if (settings) {
      this.projectSettings.set(project.id, new Map(Object.entries(settings)));
    }
  }

  private loadChapter(data: Chapter | Chapter[]): void {
    const chapters = Array.isArray(data) ? data : [data];
    for (const chapter of chapters) {
      this.chapters.set(chapter.id, {
        ...chapter,
        chapterSettings: chapter.chapterSettings || {},
      });
      if (chapter.chapterSettings) {
        // Convert unknown values to strings for storage
        const entries = Object.entries(chapter.chapterSettings).map(
          ([k, v]) => [k, String(v)] as [string, string]
        );
        this.chapterSettings.set(chapter.id, new Map(entries));
      }
    }
  }

  private loadTimelines(data: Timeline | Timeline[]): void {
    const timelines = Array.isArray(data) ? data : [data];
    for (const timeline of timelines) {
      this.timelines.set(timeline.id, {
        ...timeline,
        timelineSettings: timeline.timelineSettings || {},
      });
      if (timeline.timelineSettings) {
        this.timelineSettings.set(timeline.id, new Map(Object.entries(timeline.timelineSettings)));
      }
    }
  }

  private loadBlocks(data: Block | Block[]): void {
    const blocks = Array.isArray(data) ? data : [data];
    for (const block of blocks) {
      this.blocks.set(block.id, {
        ...block,
        blockSettings: block.blockSettings || {},
        focusPoints: block.focusPoints || [],
        transcriptionSegments: block.transcriptionSegments || [],
        faces: block.faces || [],
      });
      if (block.blockSettings) {
        this.blockSettings.set(block.id, new Map(Object.entries(block.blockSettings)));
      }
    }
  }

  private loadMediaAssets(data: MediaAsset | MediaAsset[]): void {
    const assets = Array.isArray(data) ? data : [data];
    for (const asset of assets) {
      this.mediaAssets.set(asset.id, {
        ...asset,
        focusPoints: asset.focusPoints || [],
        transcriptionSegments: asset.transcriptionSegments || [],
        faces: asset.faces || [],
        scenes: asset.scenes || [],
      });
    }
  }

  // ============================================================================
  // SNAPSHOT & DIFF
  // ============================================================================

  getSnapshot(): DataSnapshot {
    return {
      projects: new Map([...this.projects].map(([k, v]) => [k, structuredClone(v)])),
      chapters: new Map([...this.chapters].map(([k, v]) => [k, structuredClone(v)])),
      timelines: new Map([...this.timelines].map(([k, v]) => [k, structuredClone(v)])),
      blocks: new Map([...this.blocks].map(([k, v]) => [k, structuredClone(v)])),
      mediaAssets: new Map([...this.mediaAssets].map(([k, v]) => [k, structuredClone(v)])),
      projectSettings: new Map([...this.projectSettings].map(([k, v]) => [k, new Map(v)])),
      chapterSettings: new Map([...this.chapterSettings].map(([k, v]) => [k, new Map(v)])),
      timelineSettings: new Map([...this.timelineSettings].map(([k, v]) => [k, new Map(v)])),
      blockSettings: new Map([...this.blockSettings].map(([k, v]) => [k, new Map(v)])),
    };
  }

  diff(before: DataSnapshot, after: DataSnapshot): DataDiff {
    return {
      blocks: this.diffEntities(before.blocks, after.blocks),
      timelines: this.diffEntities(before.timelines, after.timelines),
      mediaAssets: this.diffEntities(before.mediaAssets, after.mediaAssets),
    };
  }

  private diffEntities<T extends { id: string }>(
    before: Map<string, T>,
    after: Map<string, T>
  ): {
    added: Array<{ id: string; data: Record<string, unknown> }>;
    modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }>;
    deleted: Array<{ id: string; data: Record<string, unknown> }>;
  } {
    const added: Array<{ id: string; data: Record<string, unknown> }> = [];
    const modified: Array<{ id: string; before: Record<string, unknown>; after: Record<string, unknown> }> = [];
    const deleted: Array<{ id: string; data: Record<string, unknown> }> = [];

    // Find added and modified
    for (const [id, afterEntity] of after) {
      const beforeEntity = before.get(id);
      if (!beforeEntity) {
        added.push({ id, data: afterEntity as unknown as Record<string, unknown> });
      } else if (JSON.stringify(beforeEntity) !== JSON.stringify(afterEntity)) {
        modified.push({
          id,
          before: beforeEntity as unknown as Record<string, unknown>,
          after: afterEntity as unknown as Record<string, unknown>,
        });
      }
    }

    // Find deleted
    for (const [id, beforeEntity] of before) {
      if (!after.has(id)) {
        deleted.push({ id, data: beforeEntity as unknown as Record<string, unknown> });
      }
    }

    return { added, modified, deleted };
  }

  // ============================================================================
  // GET INDIVIDUAL STORAGES
  // ============================================================================

  getProjectStorage(): JsonProjectStorage {
    return new JsonProjectStorage(this);
  }

  getChapterStorage(): JsonChapterStorage {
    return new JsonChapterStorage(this);
  }

  getTimelineStorage(): JsonTimelineStorage {
    return new JsonTimelineStorage(this);
  }

  getBlockStorage(): JsonBlockStorage {
    return new JsonBlockStorage(this);
  }

  getMediaAssetStorage(): JsonMediaAssetStorage {
    return new JsonMediaAssetStorage(this);
  }

  getChatStorage(): IChatStorage {
    if (!this.chatStorage) {
      this.chatStorage = new JsonChatStorage();
    }
    return this.chatStorage;
  }

  getEnrichmentStorage(): IEnrichmentStorage {
    if (!this.enrichmentStorage) {
      this.enrichmentStorage = new JsonEnrichmentStorage();
    }
    return this.enrichmentStorage;
  }

  getSettingsStorage(): ISettingsStorage {
    if (!this.settingsStorage) {
      this.settingsStorage = new JsonSettingsStorage();
    }
    return this.settingsStorage;
  }

  getPersonStorage(): IPersonStorage {
    if (!this.personStorage) {
      this.personStorage = new JsonPersonStorage();
    }
    return this.personStorage;
  }

  getDynamicCompositionStorage(): IDynamicCompositionStorage {
    if (!this.dynamicCompositionStorage) {
      this.dynamicCompositionStorage = new JsonDynamicCompositionStorage();
    }
    return this.dynamicCompositionStorage;
  }

  // ============================================================================
  // INTERNAL ACCESS (for individual storages)
  // ============================================================================

  _getProjects(): Map<string, Project> {
    return this.projects;
  }
  _getChapters(): Map<string, Chapter> {
    return this.chapters;
  }
  _getTimelines(): Map<string, Timeline> {
    return this.timelines;
  }
  _getBlocks(): Map<string, Block> {
    return this.blocks;
  }
  _getMediaAssets(): Map<string, MediaAsset> {
    return this.mediaAssets;
  }
  _getProjectSettings(): Map<string, Map<string, string>> {
    return this.projectSettings;
  }
  _getChapterSettings(): Map<string, Map<string, string>> {
    return this.chapterSettings;
  }
  _getTimelineSettings(): Map<string, Map<string, unknown>> {
    return this.timelineSettings;
  }
  _getBlockSettings(): Map<string, Map<string, unknown>> {
    return this.blockSettings;
  }
}

// ============================================================================
// JSON PROJECT STORAGE
// ============================================================================

class JsonProjectStorage implements IProjectStorage {
  constructor(private storage: JsonStorage) {}

  private get projects() {
    return this.storage._getProjects();
  }
  private get settings() {
    return this.storage._getProjectSettings();
  }

  findById(id: string): Project | undefined {
    return this.projects.get(id);
  }

  findAll(): Project[] {
    return Array.from(this.projects.values());
  }

  create(name: string, projectSettings?: Record<string, unknown>): Project {
    const id = uuidv4();
    const now = new Date().toISOString();
    const project: Project = {
      id,
      name,
      createdDate: now,
      lastModified: now,
      projectSettings: (projectSettings as Record<string, string>) || {},
    };
    this.projects.set(id, project);
    if (projectSettings) {
      this.settings.set(id, new Map(Object.entries(projectSettings as Record<string, string>)));
    }
    return project;
  }

  update(project: RawProject): void {
    const existing = this.projects.get(project.id);
    if (existing) {
      this.projects.set(project.id, {
        ...existing,
        ...project,
        lastModified: new Date().toISOString(),
      });
    }
  }

  delete(id: string): void {
    this.projects.delete(id);
    this.settings.delete(id);
  }

  getSetting(projectId: string, key: string): string | null {
    return this.settings.get(projectId)?.get(key) ?? null;
  }

  getAllSettings(projectId: string): Record<string, string> {
    const settingsMap = this.settings.get(projectId);
    if (!settingsMap) return {};
    return Object.fromEntries(settingsMap);
  }

  setSetting(projectId: string, key: string, value: string): void {
    if (!this.settings.has(projectId)) {
      this.settings.set(projectId, new Map());
    }
    this.settings.get(projectId)!.set(key, value);
    // Update project.projectSettings too
    const project = this.projects.get(projectId);
    if (project) {
      project.projectSettings[key] = value;
    }
  }

  setManySettings(projectId: string, newSettings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(newSettings)) {
      this.setSetting(projectId, key, String(value));
    }
  }

  deleteSetting(projectId: string, key: string): void {
    this.settings.get(projectId)?.delete(key);
    const project = this.projects.get(projectId);
    if (project) {
      delete project.projectSettings[key];
    }
  }
}

// ============================================================================
// JSON CHAPTER STORAGE
// ============================================================================

class JsonChapterStorage implements IChapterStorage {
  constructor(private storage: JsonStorage) {}

  private get chapters() {
    return this.storage._getChapters();
  }
  private get settings() {
    return this.storage._getChapterSettings();
  }

  findById(id: string): Chapter | null {
    return this.chapters.get(id) ?? null;
  }

  findByProjectId(projectId: string): Chapter[] {
    return Array.from(this.chapters.values())
      .filter((c) => c.projectId === projectId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  create(chapter: Omit<RawChapter, 'id' | 'createdDate' | 'modifiedDate'>): Chapter {
    const id = uuidv4();
    const now = new Date().toISOString();
    const newChapter: Chapter = {
      ...chapter,
      id,
      createdDate: now,
      modifiedDate: now,
      chapterSettings: {},
    };
    this.chapters.set(id, newChapter);
    return newChapter;
  }

  update(id: string, updates: Partial<Omit<RawChapter, 'id' | 'projectId' | 'createdDate'>>): Chapter | null {
    const chapter = this.chapters.get(id);
    if (!chapter) return null;
    const updated = {
      ...chapter,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };
    this.chapters.set(id, updated);
    return updated;
  }

  delete(id: string): boolean {
    const existed = this.chapters.has(id);
    this.chapters.delete(id);
    this.settings.delete(id);
    return existed;
  }

  deleteAllByProjectId(projectId: string): number {
    const toDelete = Array.from(this.chapters.values()).filter((c) => c.projectId === projectId);
    for (const chapter of toDelete) {
      this.chapters.delete(chapter.id);
      this.settings.delete(chapter.id);
    }
    return toDelete.length;
  }

  getSetting(chapterId: string, key: string): string | null {
    return this.settings.get(chapterId)?.get(key) as string ?? null;
  }

  getSettingsByPrefix(chapterId: string, prefix: string): Record<string, string> {
    const settingsMap = this.settings.get(chapterId);
    if (!settingsMap) return {};
    const result: Record<string, string> = {};
    for (const [k, v] of settingsMap.entries()) {
      if (k.startsWith(prefix)) {
        result[k] = v;
      }
    }
    return result;
  }

  deleteSetting(chapterId: string, key: string): void {
    this.settings.get(chapterId)?.delete(key);
    const chapter = this.chapters.get(chapterId);
    if (chapter) {
      delete chapter.chapterSettings[key];
    }
  }

  deleteAllSettings(chapterId: string): void {
    this.settings.delete(chapterId);
    const chapter = this.chapters.get(chapterId);
    if (chapter) {
      chapter.chapterSettings = {};
    }
  }

  getAllSettings(chapterId: string): Record<string, string> {
    const settingsMap = this.settings.get(chapterId);
    if (!settingsMap) return {};
    return Object.fromEntries(settingsMap) as Record<string, string>;
  }

  setSetting(chapterId: string, key: string, value: string): void {
    if (!this.settings.has(chapterId)) {
      this.settings.set(chapterId, new Map());
    }
    this.settings.get(chapterId)!.set(key, value);
    const chapter = this.chapters.get(chapterId);
    if (chapter) {
      chapter.chapterSettings[key] = value;
    }
  }

  setManySettings(chapterId: string, newSettings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(newSettings)) {
      this.setSetting(chapterId, key, String(value));
    }
  }

  countByProjectId(projectId: string): number {
    return this.findByProjectId(projectId).length;
  }

  reorderChapters(projectId: string, chapterIdsInOrder: string[]): void {
    chapterIdsInOrder.forEach((id, index) => {
      const chapter = this.chapters.get(id);
      if (chapter && chapter.projectId === projectId) {
        chapter.orderIndex = index;
      }
    });
  }

  shiftChaptersAfter(projectId: string, fromIndex: number, shift: number): number {
    let count = 0;
    for (const chapter of this.chapters.values()) {
      if (chapter.projectId === projectId && chapter.orderIndex >= fromIndex) {
        chapter.orderIndex += shift;
        count++;
      }
    }
    return count;
  }
}

// ============================================================================
// JSON TIMELINE STORAGE
// ============================================================================

class JsonTimelineStorage implements ITimelineStorage {
  constructor(private storage: JsonStorage) {}

  private get timelines() {
    return this.storage._getTimelines();
  }
  private get settings() {
    return this.storage._getTimelineSettings();
  }
  private get blocks() {
    return this.storage._getBlocks();
  }

  getById(id: string): Timeline | undefined {
    return this.timelines.get(id);
  }

  getByChapterId(chapterId: string): Timeline[] {
    return Array.from(this.timelines.values())
      .filter((t) => t.chapterId === chapterId)
      .sort((a, b) => a.orderIndex - b.orderIndex);
  }

  getByType(chapterId: string, type: string): Timeline | undefined {
    return Array.from(this.timelines.values()).find((t) => t.chapterId === chapterId && t.type === type);
  }

  create(params: { id: string; chapterId: string; type: string; label: string; orderIndex: number }): Timeline {
    const now = new Date().toISOString();
    const timeline: Timeline = {
      ...params,
      createdDate: now,
      modifiedDate: now,
      timelineSettings: {},
    };
    this.timelines.set(params.id, timeline);
    return timeline;
  }

  update(id: string, updates: Partial<Omit<RawTimeline, 'id' | 'chapterId' | 'createdDate'>>): Timeline | undefined {
    const timeline = this.timelines.get(id);
    if (!timeline) return undefined;
    const updated = {
      ...timeline,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };
    this.timelines.set(id, updated);
    return updated;
  }

  delete(id: string): void {
    this.timelines.delete(id);
    this.settings.delete(id);
  }

  getSetting(timelineId: string, key: string): string | null {
    return this.settings.get(timelineId)?.get(key) as string ?? null;
  }

  getAllSettings(timelineId: string): Record<string, unknown> {
    const settingsMap = this.settings.get(timelineId);
    if (!settingsMap) return {};
    return Object.fromEntries(settingsMap);
  }

  getSettingsByPrefix(timelineId: string, prefix: string): Record<string, unknown> {
    const settingsMap = this.settings.get(timelineId);
    if (!settingsMap) return {};
    const result: Record<string, unknown> = {};
    for (const [k, v] of settingsMap.entries()) {
      if (k.startsWith(prefix)) {
        result[k] = v;
      }
    }
    return result;
  }

  setSetting(timelineId: string, key: string, value: string): void {
    if (!this.settings.has(timelineId)) {
      this.settings.set(timelineId, new Map());
    }
    this.settings.get(timelineId)!.set(key, value);
    const timeline = this.timelines.get(timelineId);
    if (timeline) {
      timeline.timelineSettings[key] = value;
    }
  }

  setManySettings(timelineId: string, newSettings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(newSettings)) {
      this.setSetting(timelineId, key, String(value));
    }
  }

  deleteSetting(timelineId: string, key: string): void {
    this.settings.get(timelineId)?.delete(key);
    const timeline = this.timelines.get(timelineId);
    if (timeline) {
      delete timeline.timelineSettings[key];
    }
  }

  deleteAllSettings(timelineId: string): void {
    this.settings.delete(timelineId);
    const timeline = this.timelines.get(timelineId);
    if (timeline) {
      timeline.timelineSettings = {};
    }
  }

  exists(id: string): boolean {
    return this.timelines.has(id);
  }

  reorder(chapterId: string, timelineIds: string[]): void {
    timelineIds.forEach((id, index) => {
      const timeline = this.timelines.get(id);
      if (timeline && timeline.chapterId === chapterId) {
        timeline.orderIndex = index;
        timeline.modifiedDate = new Date().toISOString();
      }
    });
  }

  shiftOrderIndexes(chapterId: string, fromIndex: number, shift: number): void {
    for (const timeline of this.timelines.values()) {
      if (timeline.chapterId === chapterId && timeline.orderIndex >= fromIndex) {
        timeline.orderIndex += shift;
        timeline.modifiedDate = new Date().toISOString();
      }
    }
  }

  countByChapterId(chapterId: string): number {
    return this.getByChapterId(chapterId).length;
  }

  getNextOrderIndex(chapterId: string): number {
    const timelines = this.getByChapterId(chapterId);
    if (timelines.length === 0) return 0;
    return Math.max(...timelines.map((t) => t.orderIndex)) + 1;
  }

  calculateDuration(timelineId: string): number {
    const timelineBlocks = Array.from(this.blocks.values()).filter((b) => b.timelineId === timelineId);
    if (timelineBlocks.length === 0) return 0;
    return Math.max(
      ...timelineBlocks.map((b) => b.timelineOffsetInFrames + (b.fileRelativeEndFrame - b.fileRelativeStartFrame))
    );
  }
}

// ============================================================================
// JSON BLOCK STORAGE
// ============================================================================

class JsonBlockStorage implements IBlockStorage {
  constructor(private storage: JsonStorage) {}

  private get blocks() {
    return this.storage._getBlocks();
  }
  private get settings() {
    return this.storage._getBlockSettings();
  }
  private get timelines() {
    return this.storage._getTimelines();
  }
  private get chapters() {
    return this.storage._getChapters();
  }
  private get mediaAssets() {
    return this.storage._getMediaAssets();
  }

  getById(blockId: string): Block | undefined {
    return this.blocks.get(blockId);
  }

  getByChapterId(chapterId: string): Block[] {
    const chapterTimelines = Array.from(this.timelines.values()).filter((t) => t.chapterId === chapterId);
    const timelineIds = new Set(chapterTimelines.map((t) => t.id));
    return Array.from(this.blocks.values()).filter((b) => timelineIds.has(b.timelineId));
  }

  getByTimelineId(timelineId: string): Block[] {
    return Array.from(this.blocks.values())
      .filter((b) => b.timelineId === timelineId)
      .sort((a, b) => a.timelineOffsetInFrames - b.timelineOffsetInFrames);
  }

  getByMediaAssetId(mediaAssetId: string): Block[] {
    return Array.from(this.blocks.values()).filter((b) => b.mediaAssetId === mediaAssetId);
  }

  create(input: CreateBlockInput): Block {
    const id = input.id || uuidv4();
    const now = new Date().toISOString();
    const block: Block = {
      id,
      timelineId: input.timelineId,
      blockType: input.blockType,
      mediaAssetId: input.mediaAssetId,
      timelineOffsetInFrames: input.timelineOffsetInFrames,
      fileRelativeStartFrame: input.fileRelativeStartFrame,
      fileRelativeEndFrame: input.fileRelativeEndFrame,
      orderIndex: input.orderIndex ?? 0,
      createdDate: now,
      modifiedDate: now,
      blockSettings: (input.blockSettings as Record<string, unknown>) || {},
      focusPoints: [],
      transcriptionSegments: [],
      faces: [],
    };

    // Attach mediaAsset if exists
    if (input.mediaAssetId) {
      const asset = this.mediaAssets.get(input.mediaAssetId);
      if (asset) {
        block.mediaAsset = asset;
      }
    }

    this.blocks.set(id, block);
    if (input.blockSettings) {
      this.settings.set(id, new Map(Object.entries(input.blockSettings)));
    }
    return block;
  }

  update(blockId: string, updates: UpdateBlockInput): Block | undefined {
    const block = this.blocks.get(blockId);
    if (!block) return undefined;
    const updated = {
      ...block,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };
    this.blocks.set(blockId, updated);
    return updated;
  }

  updateBatch(updates: Array<{ id: string; updates: UpdateBlockInput }>): Block[] {
    return updates.map(({ id, updates: upd }) => this.update(id, upd)).filter((b): b is Block => b !== undefined);
  }

  delete(blockId: string): void {
    this.blocks.delete(blockId);
    this.settings.delete(blockId);
  }

  move(blockId: string, offsetInFrames: number): Block | undefined {
    const block = this.blocks.get(blockId);
    if (!block) return undefined;
    block.timelineOffsetInFrames = offsetInFrames;
    block.modifiedDate = new Date().toISOString();
    return block;
  }

  moveToTimeline(blockId: string, targetTimelineId: string, offsetInFrames?: number): Block | undefined {
    const block = this.blocks.get(blockId);
    if (!block) return undefined;
    block.timelineId = targetTimelineId;
    if (offsetInFrames !== undefined) {
      block.timelineOffsetInFrames = offsetInFrames;
    }
    block.modifiedDate = new Date().toISOString();
    return block;
  }

  split(blockId: string, splitFrame: number): { original: Block; newBlock: Block } {
    const block = this.blocks.get(blockId);
    if (!block) throw new Error(`Block ${blockId} not found`);

    const originalEndFrame = block.fileRelativeEndFrame;

    // Modify original block
    block.fileRelativeEndFrame = block.fileRelativeStartFrame + splitFrame;
    block.modifiedDate = new Date().toISOString();

    // Create new block
    const newBlock = this.create({
      timelineId: block.timelineId,
      blockType: block.blockType,
      mediaAssetId: block.mediaAssetId,
      timelineOffsetInFrames: block.timelineOffsetInFrames + splitFrame,
      fileRelativeStartFrame: block.fileRelativeStartFrame + splitFrame,
      fileRelativeEndFrame: originalEndFrame,
      blockSettings: { ...block.blockSettings },
    });

    return { original: block, newBlock };
  }

  trim(blockId: string, startFrame: number, endFrame: number | null): Block | undefined {
    const block = this.blocks.get(blockId);
    if (!block) return undefined;
    block.fileRelativeStartFrame = startFrame;
    if (endFrame !== null) {
      block.fileRelativeEndFrame = endFrame;
    }
    block.modifiedDate = new Date().toISOString();
    return block;
  }

  getSetting(blockId: string, key: string): unknown | null {
    const settingsMap = this.settings.get(blockId);
    if (!settingsMap) return null;
    return settingsMap.get(key) ?? null;
  }

  getAllSettings(blockId: string): Record<string, unknown> {
    const settingsMap = this.settings.get(blockId);
    if (!settingsMap) return {};
    return Object.fromEntries(settingsMap);
  }

  setSetting(blockId: string, key: string, value: string): void {
    if (!this.settings.has(blockId)) {
      this.settings.set(blockId, new Map());
    }
    this.settings.get(blockId)!.set(key, value);
    const block = this.blocks.get(blockId);
    if (block) {
      block.blockSettings[key] = value;
    }
  }

  setManySettings(blockId: string, newSettings: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(newSettings)) {
      this.setSetting(blockId, key, String(value));
    }
  }

  deleteManySettings(blockId: string, keys: string[]): void {
    const settingsMap = this.settings.get(blockId);
    if (!settingsMap) return;
    for (const key of keys) {
      settingsMap.delete(key);
    }
    const block = this.blocks.get(blockId);
    if (block) {
      for (const key of keys) {
        delete block.blockSettings[key];
      }
    }
  }

  // Ordering
  reorder(timelineId: string, blockIds: string[]): void {
    blockIds.forEach((id, index) => {
      const block = this.blocks.get(id);
      if (block && block.timelineId === timelineId) {
        block.orderIndex = index;
        block.modifiedDate = new Date().toISOString();
      }
    });
  }

  shiftBlocksAfter(timelineId: string, afterFrame: number, shiftAmount: number): number {
    let count = 0;
    for (const block of this.blocks.values()) {
      if (block.timelineId === timelineId && block.timelineOffsetInFrames >= afterFrame) {
        block.timelineOffsetInFrames += shiftAmount;
        block.modifiedDate = new Date().toISOString();
        count++;
      }
    }
    return count;
  }

  exists(blockId: string): boolean {
    return this.blocks.has(blockId);
  }

  countByTimelineId(timelineId: string): number {
    return this.getByTimelineId(timelineId).length;
  }

  calculateTimelineDuration(timelineId: string): number {
    const timelineBlocks = this.getByTimelineId(timelineId);
    if (timelineBlocks.length === 0) return 0;
    return Math.max(
      ...timelineBlocks.map((b) => b.timelineOffsetInFrames + (b.fileRelativeEndFrame - b.fileRelativeStartFrame))
    );
  }

  findOverlapping(timelineId: string, startFrame: number, endFrame: number): Block[] {
    return this.getByTimelineId(timelineId).filter((b) => {
      const blockEnd = b.timelineOffsetInFrames + (b.fileRelativeEndFrame - b.fileRelativeStartFrame);
      return b.timelineOffsetInFrames < endFrame && blockEnd > startFrame;
    });
  }

  find(filters: {
    projectId?: string;
    chapterIds?: string[];
    blockTypes?: string[];
    timelineTypes?: string[];
  }): Block[] {
    let result = Array.from(this.blocks.values());

    if (filters.blockTypes && filters.blockTypes.length > 0) {
      result = result.filter((b) => filters.blockTypes!.includes(b.blockType));
    }

    if (filters.chapterIds && filters.chapterIds.length > 0) {
      const chapterTimelineIds = new Set(
        Array.from(this.timelines.values())
          .filter((t) => filters.chapterIds!.includes(t.chapterId))
          .map((t) => t.id)
      );
      result = result.filter((b) => chapterTimelineIds.has(b.timelineId));
    }

    if (filters.timelineTypes && filters.timelineTypes.length > 0) {
      const typeTimelineIds = new Set(
        Array.from(this.timelines.values())
          .filter((t) => filters.timelineTypes!.includes(t.type))
          .map((t) => t.id)
      );
      result = result.filter((b) => typeTimelineIds.has(b.timelineId));
    }

    if (filters.projectId) {
      const projectChapterIds = new Set(
        Array.from(this.chapters.values())
          .filter((c) => c.projectId === filters.projectId)
          .map((c) => c.id)
      );
      const projectTimelineIds = new Set(
        Array.from(this.timelines.values())
          .filter((t) => projectChapterIds.has(t.chapterId))
          .map((t) => t.id)
      );
      result = result.filter((b) => projectTimelineIds.has(b.timelineId));
    }

    return result;
  }
}

// ============================================================================
// JSON MEDIA ASSET STORAGE
// ============================================================================

class JsonMediaAssetStorage implements IMediaAssetStorage {
  constructor(private storage: JsonStorage) {}

  private get mediaAssets() {
    return this.storage._getMediaAssets();
  }
  private get blocks() {
    return this.storage._getBlocks();
  }

  findById(id: string): MediaAsset | null {
    return this.mediaAssets.get(id) ?? null;
  }

  findByProjectId(projectId: string): MediaAsset[] {
    return Array.from(this.mediaAssets.values()).filter((a) => a.projectId === projectId);
  }

  findByType(projectId: string, mediaType: string): MediaAsset[] {
    return this.findByProjectId(projectId).filter((a) => a.mediaType === mediaType);
  }

  create(input: CreateMediaAssetInput): MediaAsset {
    const id = uuidv4();
    const asset: MediaAsset = {
      id,
      projectId: input.projectId,
      mediaType: input.mediaType,
      fileName: input.fileName,
      filePath: input.filePath,
      mimeType: input.mimeType,
      orderIndex: input.orderIndex,
      addedDate: new Date().toISOString(),
      metadata: input.metadata || {},
      typeSpecificData: input.typeSpecificData || {},
      focusPoints: [],
      transcriptionSegments: [],
      faces: [],
      scenes: [],
    };
    this.mediaAssets.set(id, asset);
    return asset;
  }

  update(id: string, updates: Partial<CreateMediaAssetInput>): MediaAsset | null {
    const asset = this.mediaAssets.get(id);
    if (!asset) return null;
    Object.assign(asset, updates);
    return asset;
  }

  delete(id: string): { success: boolean; error?: string } {
    const usedBy = this.getBlocksUsingAsset(id);
    if (usedBy.length > 0) {
      return { success: false, error: `Asset is used by ${usedBy.length} blocks` };
    }
    this.mediaAssets.delete(id);
    return { success: true };
  }

  getMetadataField<T>(assetId: string, fieldName: string): T | null {
    const asset = this.mediaAssets.get(assetId);
    if (!asset) return null;
    return (asset.metadata[fieldName] as T) ?? null;
  }

  setMetadataField(assetId: string, fieldName: string, value: unknown): void {
    const asset = this.mediaAssets.get(assetId);
    if (asset) {
      asset.metadata[fieldName] = value;
    }
  }

  updateMetadataFields(assetId: string, updates: Record<string, unknown>): void {
    const asset = this.mediaAssets.get(assetId);
    if (asset) {
      Object.assign(asset.metadata, updates);
    }
  }

  getTypeSpecificField<T>(assetId: string, fieldName: string): T | null {
    const asset = this.mediaAssets.get(assetId);
    if (!asset) return null;
    return (asset.typeSpecificData[fieldName] as T) ?? null;
  }

  setTypeSpecificField(assetId: string, fieldName: string, value: unknown): void {
    const asset = this.mediaAssets.get(assetId);
    if (asset) {
      asset.typeSpecificData[fieldName] = value;
    }
  }

  getWaveformData(assetId: string): unknown | null {
    const asset = this.mediaAssets.get(assetId);
    return asset?.waveformData ?? null;
  }

  setWaveformData(assetId: string, waveformData: unknown): void {
    const asset = this.mediaAssets.get(assetId);
    if (asset) {
      asset.waveformData = waveformData as Record<string, unknown>;
    }
  }

  existsByPath(projectId: string, filePath: string): boolean {
    return this.findByProjectId(projectId).some((a) => a.filePath === filePath);
  }

  getBlocksUsingAsset(assetId: string): Block[] {
    return Array.from(this.blocks.values()).filter((b) => b.mediaAssetId === assetId);
  }

  // Batch operations
  updateTypeSpecificFields(assetId: string, updates: Record<string, unknown>): void {
    const asset = this.mediaAssets.get(assetId);
    if (asset) {
      Object.assign(asset.typeSpecificData, updates);
    }
  }

  updateOrderIndexes(assets: Array<{ id: string; orderIndex: number }>): void {
    for (const { id, orderIndex } of assets) {
      const asset = this.mediaAssets.get(id);
      if (asset) {
        asset.orderIndex = orderIndex;
      }
    }
  }
}

// ============================================================================
// EXPORT INDIVIDUAL STORAGE CLASSES
// ============================================================================

export { JsonProjectStorage, JsonChapterStorage, JsonTimelineStorage, JsonBlockStorage, JsonMediaAssetStorage };
