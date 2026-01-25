/**
 * JsonPersonStorage - In-memory implementacja IPersonStorage dla testów
 *
 * Przechowuje dane w pamięci (Map), nie wymaga better-sqlite3.
 * Używana przez testing API zamiast SqlitePersonStorage.
 */

import { v4 as uuid } from 'uuid';
import type { IPersonStorage } from '../../../shared/storage';
import type {
  MediaAssetPerson,
  CreateMediaAssetPersonInput,
  UpdateMediaAssetPersonInput,
} from '../../../shared/types';

export class JsonPersonStorage implements IPersonStorage {
  private persons = new Map<string, MediaAssetPerson>();

  findById(id: string): MediaAssetPerson | null {
    return this.persons.get(id) ?? null;
  }

  findByProjectId(projectId: string): MediaAssetPerson[] {
    return Array.from(this.persons.values())
      .filter((p) => p.projectId === projectId)
      .sort((a, b) => a.createdDate.localeCompare(b.createdDate));
  }

  create(input: CreateMediaAssetPersonInput): MediaAssetPerson {
    const now = new Date().toISOString();
    const id = uuid();
    const person: MediaAssetPerson = {
      id,
      projectId: input.projectId,
      name: input.name || `Osoba ${this.countByProjectId(input.projectId) + 1}`,
      createdDate: now,
      modifiedDate: now,
    };

    this.persons.set(id, person);
    return person;
  }

  update(id: string, updates: UpdateMediaAssetPersonInput): MediaAssetPerson | null {
    const existing = this.persons.get(id);
    if (!existing) return null;

    const updated: MediaAssetPerson = {
      ...existing,
      ...updates,
      modifiedDate: new Date().toISOString(),
    };

    this.persons.set(id, updated);
    return updated;
  }

  delete(id: string): void {
    this.persons.delete(id);
  }

  countByProjectId(projectId: string): number {
    return this.findByProjectId(projectId).length;
  }

  // ===== RESET (dla testów) =====

  reset(): void {
    this.persons.clear();
  }
}
