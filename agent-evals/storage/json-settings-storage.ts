/**
 * JsonSettingsStorage - In-memory implementacja ISettingsStorage dla testów
 *
 * Przechowuje dane w pamięci (Map), nie wymaga better-sqlite3.
 * Używana przez testing API zamiast SqliteSettingsStorage.
 */

import type { ISettingsStorage } from '../../../desktop-app/shared/storage';

export class JsonSettingsStorage implements ISettingsStorage {
  private settings = new Map<string, string>();

  get(key: string): string | null {
    return this.settings.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.settings.set(key, value);
  }

  delete(key: string): void {
    this.settings.delete(key);
  }

  getAll(): Record<string, string> {
    return Object.fromEntries(this.settings);
  }

  // ===== RESET (dla testów) =====

  reset(): void {
    this.settings.clear();
  }
}
