/**
 * Agent Evaluation Framework - główny eksport
 *
 * Framework do testowania wieloetapowego działania agentów AI
 * z rzeczywistym wykonaniem narzędzi MCP na danych JSON.
 */

// Types
export * from './types';

// Storage
export * from './storage';

// Harness
export * from './harness';

// Services
export { getSnapshotDiffService, SnapshotDiffService } from './services/snapshot-diff-service';
