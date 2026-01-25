#!/usr/bin/env node
/**
 * CLI do uruchamiania scenariuszy testowych
 *
 * Użycie:
 *   npx ts-node testing/cli/run-scenario.ts montage/move-block-later
 *   npx ts-node testing/cli/run-scenario.ts --agent montage
 *   npx ts-node testing/cli/run-scenario.ts --all
 */

import path from 'path';
import fs from 'fs';
import { AgentTestHarness, summarizeResults, formatSummary } from '../agent-evals/harness/test-harness';
import type { TestScenario, TestResult } from '../agent-evals/types/scenario';

// ============================================================================
// CLI ARGUMENTS
// ============================================================================

interface CliArgs {
  scenarioPath?: string;
  agent?: string;
  all?: boolean;
  verbose?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--verbose' || arg === '-v') {
      result.verbose = true;
    } else if (arg === '--all' || arg === '-a') {
      result.all = true;
    } else if (arg === '--agent') {
      result.agent = args[++i];
    } else if (!arg.startsWith('-')) {
      result.scenarioPath = arg;
    }
  }

  return result;
}

function printHelp(): void {
  console.log(`
Agent Evaluation CLI - Uruchamianie scenariuszy testowych

Użycie:
  npx ts-node testing/cli/run-scenario.ts [opcje] [scenariusz]

Argumenty:
  scenariusz          Ścieżka do scenariusza (np. montage/move-block-later)

Opcje:
  --agent <typ>       Uruchom wszystkie scenariusze dla danego agenta
  --all, -a           Uruchom wszystkie scenariusze
  --verbose, -v       Szczegółowe logi
  --help, -h          Pokaż pomoc

Przykłady:
  npx ts-node testing/cli/run-scenario.ts montage/move-block-later
  npx ts-node testing/cli/run-scenario.ts --agent montage
  npx ts-node testing/cli/run-scenario.ts --all --verbose
`);
}

// ============================================================================
// SCENARIO LOADING
// ============================================================================

/**
 * Rekursywnie przeszukuje katalog w poszukiwaniu plików .scenario.ts
 */
function findScenarioFilesRecursive(
  dir: string,
  relativePath: string = ''
): { filePath: string; relativePath: string }[] {
  const results: { filePath: string; relativePath: string }[] = [];

  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const entryRelativePath = relativePath
      ? `${relativePath}/${entry.name}`
      : entry.name;

    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      results.push(...findScenarioFilesRecursive(fullPath, entryRelativePath));
    } else if (entry.name.endsWith('.scenario.ts')) {
      results.push({
        filePath: fullPath,
        relativePath: entryRelativePath.replace('.scenario.ts', ''),
      });
    }
  }

  return results;
}

async function loadScenario(scenarioPath: string): Promise<TestScenario> {
  const fullPath = path.join(
    process.cwd(),
    'testing/agent-evals/scenarios',
    `${scenarioPath}.scenario.ts`
  );

  try {
    const module = await import(fullPath);
    return module.scenario || module.default;
  } catch (error) {
    throw new Error(`Nie można załadować scenariusza: ${scenarioPath}\n${error}`);
  }
}

async function loadScenariosForAgent(agentType: string): Promise<TestScenario[]> {
  const agentDir = path.join(
    process.cwd(),
    'testing/agent-evals/scenarios',
    agentType
  );
  const indexPath = path.join(agentDir, 'index.ts');

  // Najpierw spróbuj załadować z index.ts
  if (fs.existsSync(indexPath)) {
    try {
      const module = await import(indexPath);
      if (Array.isArray(module.default)) {
        return module.default;
      }
      // Znajdź wszystkie eksporty które są scenariuszami
      const scenarios: TestScenario[] = [];
      for (const [, value] of Object.entries(module)) {
        if (
          value &&
          typeof value === 'object' &&
          'id' in value &&
          'name' in value &&
          'agent' in value
        ) {
          scenarios.push(value as TestScenario);
        }
      }
      if (scenarios.length > 0) {
        return scenarios;
      }
    } catch {
      // Fallback do rekursywnego wyszukiwania
    }
  }

  // Fallback: rekursywne wyszukiwanie plików .scenario.ts
  const scenarioFiles = findScenarioFilesRecursive(agentDir);

  if (scenarioFiles.length === 0) {
    throw new Error(`Nie znaleziono scenariuszy dla agenta: ${agentType}`);
  }

  const scenarios: TestScenario[] = [];
  for (const file of scenarioFiles) {
    try {
      const module = await import(file.filePath);
      const scenario = module.scenario || module.default;
      if (scenario) {
        scenarios.push(scenario);
      }
    } catch (error) {
      console.warn(`Nie można załadować scenariusza ${file.relativePath}: ${error}`);
    }
  }

  return scenarios;
}

async function loadAllScenarios(): Promise<TestScenario[]> {
  const agents = ['montage', 'script', 'media-scout'];
  const allScenarios: TestScenario[] = [];

  for (const agent of agents) {
    try {
      const scenarios = await loadScenariosForAgent(agent);
      allScenarios.push(...scenarios);
    } catch {
      // Agent może nie mieć scenariuszy
    }
  }

  return allScenarios;
}

// ============================================================================
// RESULT FORMATTING
// ============================================================================

function formatResult(result: TestResult): string {
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  const lines = [
    `\n${status}: ${result.scenarioName}`,
    `  ID: ${result.scenarioId}`,
    `  Tokens: ${result.metrics.totalTokens} (${result.metrics.inputTokens} in / ${result.metrics.outputTokens} out)`,
    `  Latency: ${(result.metrics.latencyMs / 1000).toFixed(2)}s`,
    `  Turns: ${result.metrics.turnCount}`,
    `  Tool calls: ${result.toolCalls.map((c) => c.toolName).join(' → ') || 'none'}`,
  ];

  if (!result.passed) {
    lines.push('  Failed assertions:');
    for (const assertion of result.assertions.filter((a) => !a.passed)) {
      lines.push(`    - ${assertion.name}: ${assertion.message || 'failed'}`);
    }
  }

  if (result.error) {
    lines.push(`  Error: ${result.error}`);
  }

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const harness = new AgentTestHarness({
    verbose: args.verbose,
    onToolCall: (call) => {
      if (args.verbose) {
        console.log(`  [Tool] ${call.toolName} (${call.durationMs}ms)`);
      }
    },
  });

  let scenarios: TestScenario[] = [];

  // Załaduj scenariusze
  if (args.all) {
    console.log('Ładowanie wszystkich scenariuszy...');
    scenarios = await loadAllScenarios();
  } else if (args.agent) {
    console.log(`Ładowanie scenariuszy dla agenta: ${args.agent}`);
    scenarios = await loadScenariosForAgent(args.agent);
  } else if (args.scenarioPath) {
    console.log(`Ładowanie scenariusza: ${args.scenarioPath}`);
    const scenario = await loadScenario(args.scenarioPath);
    scenarios = [scenario];
  } else {
    printHelp();
    process.exit(1);
  }

  if (scenarios.length === 0) {
    console.error('Nie znaleziono żadnych scenariuszy');
    process.exit(1);
  }

  console.log(`\nUruchamianie ${scenarios.length} scenariuszy...\n`);

  // Uruchom scenariusze
  const results: TestResult[] = [];

  for (const scenario of scenarios) {
    console.log(`Running: ${scenario.name}...`);

    try {
      const result = await harness.runScenario(scenario);
      results.push(result);
      console.log(formatResult(result));
    } catch (error) {
      console.error(`  ERROR: ${error}`);
      results.push({
        id: 'error',
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        passed: false,
        toolCalls: [],
        dataDiff: { blocks: { added: [], modified: [], deleted: [] }, timelines: { added: [], modified: [], deleted: [] }, mediaAssets: { added: [], modified: [], deleted: [] } },
        assertions: [{ name: 'Execution', passed: false, message: String(error) }],
        metrics: { inputTokens: 0, outputTokens: 0, totalTokens: 0, latencyMs: 0, turnCount: 0 },
        error: String(error),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }
  }

  // Podsumowanie
  const summary = summarizeResults(results);
  console.log(formatSummary(summary));

  // Exit code
  process.exit(summary.failed > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
