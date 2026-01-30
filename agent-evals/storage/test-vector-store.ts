/**
 * TestVectorStore - Read-only implementacja IVectorStoreReader dla testów
 *
 * Otwiera istniejącą bazę LanceDB fixtures w trybie read-only.
 * Używana przez testy agentów do semantycznego wyszukiwania.
 */

import type { Connection, Table } from '@lancedb/lancedb';
import type {
  IVectorStoreReader,
  SceneSearchResult,
  ProjectContextSearchResult,
  TranscriptionSearchResult,
  TranscriptionSearchOptions
} from '../../../electron/services/vector/IVectorStoreReader';

const TABLE_NAME = 'scene_embeddings';
const PROJECT_CONTEXTS_TABLE_NAME = 'project_contexts';
const TRANSCRIPTION_EMBEDDINGS_TABLE_NAME = 'transcription_embeddings';

export class TestVectorStore implements IVectorStoreReader {
  private db: Connection | null = null;
  private sceneTable: Table | null = null;
  private projectContextsTable: Table | null = null;
  private transcriptionTable: Table | null = null;
  private initialized = false;

  constructor(private lanceDbPath: string) {}

  /**
   * Inicjalizuj połączenie z LanceDB fixtures (read-only)
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[TestVectorStore] Initializing from:', this.lanceDbPath);

    const lancedb = await import('@lancedb/lancedb');
    this.db = await lancedb.connect(this.lanceDbPath);

    // Otwórz istniejące tabele (read-only - nie twórz nowych)
    const tableNames = await this.db.tableNames();

    if (tableNames.includes(TABLE_NAME)) {
      this.sceneTable = await this.db.openTable(TABLE_NAME);
      console.log('[TestVectorStore] Opened table:', TABLE_NAME);
    }

    if (tableNames.includes(PROJECT_CONTEXTS_TABLE_NAME)) {
      this.projectContextsTable = await this.db.openTable(PROJECT_CONTEXTS_TABLE_NAME);
      console.log('[TestVectorStore] Opened table:', PROJECT_CONTEXTS_TABLE_NAME);
    }

    if (tableNames.includes(TRANSCRIPTION_EMBEDDINGS_TABLE_NAME)) {
      this.transcriptionTable = await this.db.openTable(TRANSCRIPTION_EMBEDDINGS_TABLE_NAME);
      console.log('[TestVectorStore] Opened table:', TRANSCRIPTION_EMBEDDINGS_TABLE_NAME);
    }

    this.initialized = true;
    console.log('[TestVectorStore] Initialized successfully');
  }

  /**
   * Wyszukiwanie wektorowe scen w ramach projektu
   */
  async searchSceneEmbeddings(
    queryEmbedding: number[],
    projectId: string,
    limit: number = 10
  ): Promise<SceneSearchResult[]> {
    if (!this.sceneTable) {
      console.log('[TestVectorStore] Scene table not available');
      return [];
    }

    // Sprawdź czy są jakiekolwiek embeddingi dla projektu
    const count = await this.countByProject(projectId);
    if (count === 0) {
      return [];
    }

    const results = await this.sceneTable
      .vectorSearch(queryEmbedding)
      .where(`\`projectId\` = '${projectId}'`)
      .limit(limit)
      .toArray();

    return results.map((row: { id: string; _distance: number }) => ({
      id: row.id,
      distance: row._distance
    }));
  }

  /**
   * Wyszukiwanie wektorowe w transkrypcjach projektu
   */
  async searchTranscriptionEmbeddings(
    queryEmbedding: number[],
    projectId: string,
    options?: TranscriptionSearchOptions
  ): Promise<TranscriptionSearchResult[]> {
    console.log(`[TestVectorStore] searchTranscriptionEmbeddings: projectId='${projectId}', limit=${options?.limit ?? 10}`);

    if (!this.transcriptionTable) {
      console.log('[TestVectorStore] searchTranscriptionEmbeddings: table not available');
      return [];
    }

    const limit = options?.limit ?? 10;

    // Sprawdź czy są jakiekolwiek embeddingi dla projektu
    const count = await this.countTranscriptionEmbeddings(projectId);
    console.log(`[TestVectorStore] searchTranscriptionEmbeddings: count=${count}`);

    if (count === 0) {
      console.log('[TestVectorStore] searchTranscriptionEmbeddings: NO RECORDS - returning early');
      return [];
    }

    // Buduj where clause
    let whereClause = `\`projectId\` = '${projectId}'`;
    if (options?.assetIds && options.assetIds.length > 0) {
      const assetIdsStr = options.assetIds.map(id => `'${id}'`).join(', ');
      whereClause += ` AND \`assetId\` IN (${assetIdsStr})`;
    }

    const results = await this.transcriptionTable
      .vectorSearch(queryEmbedding)
      .where(whereClause)
      .limit(limit)
      .toArray();

    return results.map(
      (row: { id: string; assetId: string; chunkIndex: number; text: string; segmentIds: string; _distance: number }) => ({
        id: row.id,
        assetId: row.assetId,
        chunkIndex: row.chunkIndex,
        text: row.text,
        segmentIds: JSON.parse(row.segmentIds),
        distance: row._distance,
      })
    );
  }

  /**
   * Wyszukiwanie wektorowe w kontekstach projektu (RAG)
   */
  async searchProjectContextChunks(
    queryEmbedding: number[],
    projectId: string,
    projectSettingsKey?: string,
    limit: number = 5
  ): Promise<ProjectContextSearchResult[]> {
    if (!this.projectContextsTable) {
      console.log('[TestVectorStore] Project contexts table not available');
      return [];
    }

    // Sprawdź czy są jakiekolwiek chunki dla projektu
    const count = await this.countProjectContextChunks(projectId, projectSettingsKey);
    if (count === 0) {
      return [];
    }

    const whereClause = projectSettingsKey
      ? `\`projectId\` = '${projectId}' AND \`projectSettings\` = '${projectSettingsKey}'`
      : `\`projectId\` = '${projectId}'`;

    const results = await this.projectContextsTable
      .vectorSearch(queryEmbedding)
      .where(whereClause)
      .limit(limit)
      .toArray();

    return results.map(
      (row: { id: string; projectSettings: string; text: string; chunkIndex: number; _distance: number }) => ({
        id: row.id,
        projectSettings: row.projectSettings,
        text: row.text,
        chunkIndex: row.chunkIndex,
        distance: row._distance,
      })
    );
  }

  /**
   * Sprawdź czy scena ma embedding
   */
  async hasEmbedding(sceneId: string): Promise<boolean> {
    if (!this.sceneTable) {
      return false;
    }

    const results = await this.sceneTable
      .query()
      .where(`id = '${sceneId}'`)
      .limit(1)
      .toArray();

    return results.length > 0;
  }

  /**
   * Liczba embeddingów scen w projekcie
   */
  async countByProject(projectId: string): Promise<number> {
    if (!this.sceneTable) {
      return 0;
    }

    const results = await this.sceneTable
      .query()
      .where(`\`projectId\` = '${projectId}'`)
      .toArray();

    return results.length;
  }

  /**
   * Liczba embeddingów transkrypcji w projekcie
   */
  async countTranscriptionEmbeddings(projectId: string, assetId?: string): Promise<number> {
    if (!this.transcriptionTable) {
      console.log('[TestVectorStore] countTranscriptionEmbeddings: table not available');
      return 0;
    }

    // Diagnostyka: pokaż wszystkie unikalne projectIds w tabeli
    const allRows = await this.transcriptionTable.query().toArray();
    const uniqueProjectIds = [...new Set(allRows.map((r: { projectId: string }) => r.projectId))];
    console.log(`[TestVectorStore] countTranscriptionEmbeddings: total rows=${allRows.length}, uniqueProjectIds=${JSON.stringify(uniqueProjectIds)}`);
    console.log(`[TestVectorStore] countTranscriptionEmbeddings: searching for projectId='${projectId}'`);

    const whereClause = assetId
      ? `\`projectId\` = '${projectId}' AND \`assetId\` = '${assetId}'`
      : `\`projectId\` = '${projectId}'`;

    const results = await this.transcriptionTable.query().where(whereClause).toArray();
    console.log(`[TestVectorStore] countTranscriptionEmbeddings: found ${results.length} rows for projectId='${projectId}'`);

    return results.length;
  }

  /**
   * Liczba chunków kontekstu w projekcie
   */
  async countProjectContextChunks(projectId: string, projectSettingsKey?: string): Promise<number> {
    if (!this.projectContextsTable) {
      return 0;
    }

    const whereClause = projectSettingsKey
      ? `\`projectId\` = '${projectId}' AND \`projectSettings\` = '${projectSettingsKey}'`
      : `\`projectId\` = '${projectId}'`;

    const results = await this.projectContextsTable.query().where(whereClause).toArray();

    return results.length;
  }
}
