/**
 * Tool Tracker - śledzenie wywołań narzędzi MCP podczas testów
 *
 * Opakowuje funkcje narzędzi i loguje wywołania.
 */

import type { ToolCall } from '../types/scenario';

export class ToolTracker {
  private calls: ToolCall[] = [];
  private orderCounter = 0;

  /**
   * Opakowuje funkcję narzędzia MCP, logując wywołania
   */
  wrap<TInput, TOutput>(
    toolName: string,
    toolFn: (input: TInput) => TOutput | Promise<TOutput>
  ): (input: TInput) => Promise<TOutput> {
    return async (input: TInput): Promise<TOutput> => {
      const startTime = Date.now();
      const order = this.orderCounter++;

      try {
        const output = await toolFn(input);

        this.calls.push({
          toolName,
          input: input as Record<string, unknown>,
          output,
          timestamp: startTime,
          order,
          durationMs: Date.now() - startTime,
        });

        return output;
      } catch (error) {
        this.calls.push({
          toolName,
          input: input as Record<string, unknown>,
          output: { error: error instanceof Error ? error.message : String(error) },
          timestamp: startTime,
          order,
          durationMs: Date.now() - startTime,
        });
        throw error;
      }
    };
  }

  /**
   * Opakowuje obiekt narzędzi MCP (wszystkie metody)
   */
  wrapToolsObject<T extends Record<string, (...args: unknown[]) => unknown>>(tools: T): T {
    const wrappedTools = {} as T;

    for (const [name, fn] of Object.entries(tools)) {
      if (typeof fn === 'function') {
        wrappedTools[name as keyof T] = this.wrap(name, fn as (input: unknown) => unknown) as T[keyof T];
      }
    }

    return wrappedTools;
  }

  /**
   * Rejestruje wywołanie narzędzia ręcznie (bez opakowywania)
   * Używane gdy tool calls są śledzone z message stream agenta lub przez toolWrapper
   *
   * @param toolName - Nazwa narzędzia
   * @param input - Parametry wejściowe
   * @param result - Wynik wywołania
   * @param timestamp - Timestamp początku wywołania
   * @param durationMs - Czas wykonania w ms (opcjonalny - gdy używany z toolWrapper)
   */
  recordCall(
    toolName: string,
    input: Record<string, unknown>,
    result: unknown,
    timestamp: number,
    durationMs?: number
  ): void {
    this.calls.push({
      toolName,
      input,
      output: result,
      timestamp,
      order: this.orderCounter++,
      durationMs: durationMs ?? 0,
    });
  }

  /**
   * Zwraca wszystkie wywołania
   */
  getCalls(): ToolCall[] {
    return [...this.calls];
  }

  /**
   * Zwraca wywołania dla konkretnego narzędzia
   */
  getCallsByTool(toolName: string): ToolCall[] {
    return this.calls.filter((c) => c.toolName === toolName);
  }

  /**
   * Zwraca sekwencję nazw wywołanych narzędzi
   */
  getCallSequence(): string[] {
    return this.calls.sort((a, b) => a.order - b.order).map((c) => c.toolName);
  }

  /**
   * Zwraca unikalne nazwy wywołanych narzędzi
   */
  getUniqueToolNames(): string[] {
    return [...new Set(this.calls.map((c) => c.toolName))];
  }

  /**
   * Sprawdza czy narzędzie zostało wywołane
   */
  wasCalled(toolName: string): boolean {
    return this.calls.some((c) => c.toolName === toolName);
  }

  /**
   * Sprawdza czy narzędzia zostały wywołane w określonej kolejności
   */
  wasCalledInOrder(toolNames: string[]): boolean {
    const sequence = this.getCallSequence();
    let lastIndex = -1;

    for (const toolName of toolNames) {
      const index = sequence.indexOf(toolName, lastIndex + 1);
      if (index === -1) return false;
      lastIndex = index;
    }

    return true;
  }

  /**
   * Resetuje tracker
   */
  reset(): void {
    this.calls = [];
    this.orderCounter = 0;
  }

  /**
   * Zwraca statystyki wywołań
   */
  getStats(): {
    totalCalls: number;
    uniqueTools: number;
    totalDurationMs: number;
    avgDurationMs: number;
    callsPerTool: Record<string, number>;
  } {
    const callsPerTool: Record<string, number> = {};
    let totalDuration = 0;

    for (const call of this.calls) {
      callsPerTool[call.toolName] = (callsPerTool[call.toolName] || 0) + 1;
      totalDuration += call.durationMs;
    }

    return {
      totalCalls: this.calls.length,
      uniqueTools: Object.keys(callsPerTool).length,
      totalDurationMs: totalDuration,
      avgDurationMs: this.calls.length > 0 ? totalDuration / this.calls.length : 0,
      callsPerTool,
    };
  }
}
