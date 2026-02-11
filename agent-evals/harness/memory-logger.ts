/**
 * MemoryLogger
 *
 * Implementacja IAgentLogger przechowująca logi w pamięci.
 * Używana w testach do zbierania i analizy logów agenta.
 */

import type { IAgentLogger } from '../../../desktop-app/shared/types/logger';

/**
 * Wpis loga
 */
export interface LogEntry {
  level: 'info' | 'error' | 'debug' | 'warn';
  source: string;
  message: string;
  data?: unknown;
  timestamp: number;
}

/**
 * Logger przechowujący logi w pamięci
 * Używany w testach do zbierania logów agenta
 */
export class MemoryLogger implements IAgentLogger {
  private entries: LogEntry[] = [];

  info(source: string, message: string, data?: unknown): void {
    this.addEntry('info', source, message, data);
  }

  error(source: string, message: string, data?: unknown): void {
    this.addEntry('error', source, message, data);
  }

  debug(source: string, message: string, data?: unknown): void {
    this.addEntry('debug', source, message, data);
  }

  warn(source: string, message: string, data?: unknown): void {
    this.addEntry('warn', source, message, data);
  }

  private addEntry(level: LogEntry['level'], source: string, message: string, data?: unknown): void {
    this.entries.push({
      level,
      source,
      message,
      data,
      timestamp: Date.now()
    });
  }

  /**
   * Zwraca wszystkie wpisy logów
   */
  getEntries(): LogEntry[] {
    return [...this.entries];
  }

  /**
   * Zwraca tylko wpisy błędów
   */
  getErrors(): LogEntry[] {
    return this.entries.filter(e => e.level === 'error');
  }

  /**
   * Zwraca tylko wpisy ostrzeżeń
   */
  getWarnings(): LogEntry[] {
    return this.entries.filter(e => e.level === 'warn');
  }

  /**
   * Czyści wszystkie wpisy
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * Zwraca logi jako tablicę stringów (do snapshotów)
   */
  toStringArray(): string[] {
    return this.entries.map(e =>
      `[${e.level.toUpperCase()}] [${e.source}] ${e.message}${e.data ? ' ' + JSON.stringify(e.data) : ''}`
    );
  }

  /**
   * Sprawdza czy są jakiekolwiek błędy
   */
  hasErrors(): boolean {
    return this.entries.some(e => e.level === 'error');
  }

  /**
   * Filtruje wpisy po źródle
   */
  getBySource(source: string): LogEntry[] {
    return this.entries.filter(e => e.source === source);
  }

  /**
   * Filtruje wpisy po wiadomości (zawiera)
   */
  getByMessage(substring: string): LogEntry[] {
    return this.entries.filter(e => e.message.includes(substring));
  }
}
