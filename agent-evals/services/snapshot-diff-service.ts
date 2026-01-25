/**
 * Snapshot Diff Service - porównywanie konfiguracji między runami
 */

import type {
  SuiteConfigSnapshot,
  ConfigDiff,
  ConfigDiffResult,
} from '../types/config-snapshot';

// ============================================================================
// SNAPSHOT DIFF SERVICE
// ============================================================================

export class SnapshotDiffService {
  /**
   * Porównuje dwie konfiguracje
   */
  compare(snapshot1: SuiteConfigSnapshot, snapshot2: SuiteConfigSnapshot): ConfigDiffResult {
    // Quick check - hash match
    if (snapshot1.configHash === snapshot2.configHash) {
      return {
        identical: true,
        hashMatch: true,
        differences: {
          agentConfig: [],
          systemPrompt: [],
          mcpTools: [],
        },
        summary: {
          totalChanges: 0,
          criticalChanges: [],
        },
      };
    }

    // Deep diff
    const agentConfigDiffs = this.diffAgentConfig(snapshot1.agentConfig, snapshot2.agentConfig);
    const systemPromptDiffs = this.diffSystemPrompt(snapshot1.systemPrompt, snapshot2.systemPrompt);
    const mcpToolsDiffs = this.diffMcpTools(snapshot1.mcpTools, snapshot2.mcpTools);

    const allDiffs = [...agentConfigDiffs, ...systemPromptDiffs, ...mcpToolsDiffs];
    const criticalChanges = allDiffs
      .filter((d) => d.severity === 'critical')
      .map((d) => d.path);

    return {
      identical: allDiffs.length === 0,
      hashMatch: false,
      differences: {
        agentConfig: agentConfigDiffs,
        systemPrompt: systemPromptDiffs,
        mcpTools: mcpToolsDiffs,
      },
      summary: {
        totalChanges: allDiffs.length,
        criticalChanges,
      },
    };
  }

  /**
   * Diff konfiguracji agenta
   */
  private diffAgentConfig(
    config1: SuiteConfigSnapshot['agentConfig'],
    config2: SuiteConfigSnapshot['agentConfig']
  ): ConfigDiff[] {
    const diffs: ConfigDiff[] = [];

    if (config1.agentType !== config2.agentType) {
      diffs.push({
        path: 'agentConfig.agentType',
        type: 'changed',
        oldValue: config1.agentType,
        newValue: config2.agentType,
        severity: 'critical',
      });
    }

    if (config1.model !== config2.model) {
      diffs.push({
        path: 'agentConfig.model',
        type: 'changed',
        oldValue: config1.model,
        newValue: config2.model,
        severity: 'warning',
      });
    }

    if (config1.thinkingMode !== config2.thinkingMode) {
      diffs.push({
        path: 'agentConfig.thinkingMode',
        type: 'changed',
        oldValue: config1.thinkingMode,
        newValue: config2.thinkingMode,
        severity: 'info',
      });
    }

    if (config1.maxTokens !== config2.maxTokens) {
      diffs.push({
        path: 'agentConfig.maxTokens',
        type: 'changed',
        oldValue: config1.maxTokens,
        newValue: config2.maxTokens,
        severity: 'info',
      });
    }

    return diffs;
  }

  /**
   * Diff system promptu
   */
  private diffSystemPrompt(
    prompt1: SuiteConfigSnapshot['systemPrompt'],
    prompt2: SuiteConfigSnapshot['systemPrompt']
  ): ConfigDiff[] {
    const diffs: ConfigDiff[] = [];

    if (prompt1.rawPrompt !== prompt2.rawPrompt) {
      diffs.push({
        path: 'systemPrompt.rawPrompt',
        type: 'changed',
        oldValue: this.truncate(prompt1.rawPrompt, 200),
        newValue: this.truncate(prompt2.rawPrompt, 200),
        severity: 'critical',
      });
    }

    // Diff dynamic lists
    const lists1 = prompt1.dynamicLists || {};
    const lists2 = prompt2.dynamicLists || {};

    for (const key of ['templates', 'trackTypes', 'blockTypes', 'compositions'] as const) {
      const arr1 = lists1[key] || [];
      const arr2 = lists2[key] || [];

      const added = arr2.filter((x) => !arr1.includes(x));
      const removed = arr1.filter((x) => !arr2.includes(x));

      if (added.length > 0) {
        diffs.push({
          path: `systemPrompt.dynamicLists.${key}`,
          type: 'added',
          newValue: added,
          severity: 'warning',
        });
      }

      if (removed.length > 0) {
        diffs.push({
          path: `systemPrompt.dynamicLists.${key}`,
          type: 'removed',
          oldValue: removed,
          severity: 'warning',
        });
      }
    }

    return diffs;
  }

  /**
   * Diff narzędzi MCP
   */
  private diffMcpTools(
    tools1: SuiteConfigSnapshot['mcpTools'],
    tools2: SuiteConfigSnapshot['mcpTools']
  ): ConfigDiff[] {
    const diffs: ConfigDiff[] = [];

    // Allowed tools
    const allowed1 = new Set(tools1.allowedTools);
    const allowed2 = new Set(tools2.allowedTools);

    const addedTools = tools2.allowedTools.filter((t) => !allowed1.has(t));
    const removedTools = tools1.allowedTools.filter((t) => !allowed2.has(t));

    if (addedTools.length > 0) {
      diffs.push({
        path: 'mcpTools.allowedTools',
        type: 'added',
        newValue: addedTools,
        severity: 'warning',
      });
    }

    if (removedTools.length > 0) {
      diffs.push({
        path: 'mcpTools.allowedTools',
        type: 'removed',
        oldValue: removedTools,
        severity: 'critical',
      });
    }

    // Tool definitions - diff descriptions
    const defs1 = new Map(tools1.toolDefinitions.map((t) => [t.name, t]));
    const defs2 = new Map(tools2.toolDefinitions.map((t) => [t.name, t]));

    for (const [name, def2] of defs2) {
      const def1 = defs1.get(name);

      if (!def1) {
        diffs.push({
          path: `mcpTools.toolDefinitions.${name}`,
          type: 'added',
          newValue: { name: def2.name, description: this.truncate(def2.description, 100) },
          severity: 'warning',
        });
      } else if (def1.description !== def2.description) {
        diffs.push({
          path: `mcpTools.toolDefinitions.${name}.description`,
          type: 'changed',
          oldValue: this.truncate(def1.description, 100),
          newValue: this.truncate(def2.description, 100),
          severity: 'warning',
        });
      }
    }

    for (const [name, def1] of defs1) {
      if (!defs2.has(name)) {
        diffs.push({
          path: `mcpTools.toolDefinitions.${name}`,
          type: 'removed',
          oldValue: { name: def1.name, description: this.truncate(def1.description, 100) },
          severity: 'critical',
        });
      }
    }

    return diffs;
  }

  /**
   * Pomocnik do skracania tekstu
   */
  private truncate(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
  }

  /**
   * Formatuje diff do wyświetlenia
   */
  formatDiff(diff: ConfigDiff): string {
    const icon = diff.type === 'added' ? '+' : diff.type === 'removed' ? '-' : '~';
    const severity = diff.severity === 'critical' ? '!!' : diff.severity === 'warning' ? '!' : '';

    let value = '';
    if (diff.type === 'changed') {
      value = `"${diff.oldValue}" → "${diff.newValue}"`;
    } else if (diff.type === 'added') {
      value = `"${diff.newValue}"`;
    } else {
      value = `"${diff.oldValue}"`;
    }

    return `${severity}${icon} ${diff.path}: ${value}`;
  }

  /**
   * Formatuje cały wynik diff'a
   */
  formatDiffResult(result: ConfigDiffResult): string {
    if (result.identical) {
      return 'Configurations are identical (hash match)';
    }

    const lines: string[] = ['Configuration differences:'];

    if (result.differences.agentConfig.length > 0) {
      lines.push('\n  Agent Config:');
      result.differences.agentConfig.forEach((d) => {
        lines.push(`    ${this.formatDiff(d)}`);
      });
    }

    if (result.differences.systemPrompt.length > 0) {
      lines.push('\n  System Prompt:');
      result.differences.systemPrompt.forEach((d) => {
        lines.push(`    ${this.formatDiff(d)}`);
      });
    }

    if (result.differences.mcpTools.length > 0) {
      lines.push('\n  MCP Tools:');
      result.differences.mcpTools.forEach((d) => {
        lines.push(`    ${this.formatDiff(d)}`);
      });
    }

    lines.push(`\nTotal changes: ${result.summary.totalChanges}`);
    if (result.summary.criticalChanges.length > 0) {
      lines.push(`Critical: ${result.summary.criticalChanges.join(', ')}`);
    }

    return lines.join('\n');
  }
}

// Singleton
let instance: SnapshotDiffService | null = null;

export function getSnapshotDiffService(): SnapshotDiffService {
  if (!instance) {
    instance = new SnapshotDiffService();
  }
  return instance;
}
