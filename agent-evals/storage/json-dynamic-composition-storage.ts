/**
 * JsonDynamicCompositionStorage - In-memory implementacja IDynamicCompositionStorage dla testów
 *
 * Przechowuje dane w pamięci (Map), nie wymaga better-sqlite3.
 * Używana przez testing API zamiast SqliteDynamicCompositionStorage.
 */

import type { IDynamicCompositionStorage } from '../../../desktop-app/shared/storage';
import type {
  DynamicComposition,
  UpdateDynamicCompositionInput,
  DynamicCompositionCompilationStatus,
  SettingsSchema,
} from '../../../desktop-app/shared/types';

export class JsonDynamicCompositionStorage implements IDynamicCompositionStorage {
  private compositions = new Map<string, DynamicComposition>();

  getById(id: string): DynamicComposition | undefined {
    return this.compositions.get(id);
  }

  getByProjectId(projectId: string, includeInactive = false): DynamicComposition[] {
    return Array.from(this.compositions.values())
      .filter((c) => c.projectId === projectId && (includeInactive || c.isActive))
      .sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  }

  getByStatus(projectId: string, status: DynamicCompositionCompilationStatus): DynamicComposition[] {
    return this.getByProjectId(projectId).filter((c) => c.compilationStatus === status);
  }

  create(params: {
    id: string;
    projectId: string;
    name: string;
    description?: string;
    sourceCode: string;
    defaultDurationInFrames?: number;
  }): void {
    const now = new Date().toISOString();
    const composition: DynamicComposition = {
      id: params.id,
      projectId: params.projectId,
      name: params.name,
      description: params.description ?? null,
      sourceCode: params.sourceCode,
      compiledCode: null,
      compilationStatus: 'pending',
      compilationErrors: null,
      version: 1,
      propSchemas: [],
      defaultDurationInFrames: params.defaultDurationInFrames ?? 150,
      isActive: true,
      createdDate: now,
      modifiedDate: now,
    };
    this.compositions.set(params.id, composition);
  }

  update(id: string, updates: UpdateDynamicCompositionInput): DynamicComposition | undefined {
    const existing = this.compositions.get(id);
    if (!existing) return undefined;

    const updated: DynamicComposition = {
      ...existing,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };

    this.compositions.set(id, updated);
    return updated;
  }

  updateCode(
    id: string,
    params: {
      sourceCode: string;
      compiledCode?: string;
      compilationStatus: DynamicCompositionCompilationStatus;
      compilationErrors?: string[];
    }
  ): DynamicComposition | undefined {
    const existing = this.compositions.get(id);
    if (!existing) return undefined;

    const updated: DynamicComposition = {
      ...existing,
      sourceCode: params.sourceCode,
      compiledCode: params.compiledCode ?? null,
      compilationStatus: params.compilationStatus,
      compilationErrors: params.compilationErrors ?? null,
      version: existing.version + 1,
      modifiedDate: new Date().toISOString(),
    };

    this.compositions.set(id, updated);
    return updated;
  }

  updateCompilationResult(
    id: string,
    compiledCode: string | null,
    status: DynamicCompositionCompilationStatus,
    errors?: string[]
  ): void {
    const existing = this.compositions.get(id);
    if (!existing) return;

    existing.compiledCode = compiledCode;
    existing.compilationStatus = status;
    existing.compilationErrors = errors ?? null;
    existing.modifiedDate = new Date().toISOString();
  }

  updatePropSchemas(id: string, propSchemas: SettingsSchema[]): DynamicComposition | undefined {
    const existing = this.compositions.get(id);
    if (!existing) return undefined;

    existing.propSchemas = propSchemas;
    existing.modifiedDate = new Date().toISOString();
    return existing;
  }

  delete(id: string): boolean {
    return this.compositions.delete(id);
  }

  // ===== RESET (dla testów) =====

  reset(): void {
    this.compositions.clear();
  }
}
