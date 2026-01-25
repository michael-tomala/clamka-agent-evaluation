/**
 * Assertions - sprawdzanie oczekiwań testowych
 *
 * Weryfikuje wywołania narzędzi, stan końcowy i zachowanie agenta.
 */

import type {
  ScenarioExpectations,
  ToolCallExpectations,
  FinalStateExpectations,
  AgentBehaviorExpectation,
  MatchCondition,
  BlockMatchCondition,
  AssertionResult,
  ToolCall,
  DataDiff,
  ReferenceTagsExpectations,
  ReferenceTagExpectation,
} from '../types/scenario';

// ============================================================================
// PARSED REFERENCE TAG
// ============================================================================

interface ParsedReferenceTag {
  tag: string; // np. 'block'
  attrs: Record<string, string>; // np. { id: 'abc', type: 'video' }
  label: string; // np. 'Intro video'
  fullMatch: string;
}

// ============================================================================
// ASSERTION CHECKER
// ============================================================================

export class AssertionChecker {
  private results: AssertionResult[] = [];

  /**
   * Sprawdza wszystkie oczekiwania (tablica zestawów - logika OR).
   * Test przechodzi jeśli JEDEN z zestawów pasuje.
   */
  check(
    expectations: ScenarioExpectations[],
    toolCalls: ToolCall[],
    dataDiff: DataDiff,
    agentResponse?: string
  ): AssertionResult[] {
    this.results = [];

    // Sprawdź każdy zestaw oczekiwań
    const expectationResults = expectations.map((exp, index) => {
      const results = this.checkSingleExpectation(exp, toolCalls, dataDiff, agentResponse);
      // Uwzględnij softCheck - asercje z softCheck=true nie blokują sukcesu
      const allPassed = results.every((r) => r.passed || r.softCheck);
      return { index, results, allPassed };
    });

    // Znajdź pierwszy który przeszedł
    const passed = expectationResults.find((r) => r.allPassed);

    if (passed) {
      // Jeśli jest tylko jeden zestaw, zwróć tylko wyniki
      if (expectations.length === 1) {
        this.results = passed.results;
        return this.results;
      }
      // Zwróć wyniki pierwszego udanego zestawu
      this.results = [
        {
          name: `Expectation ${passed.index + 1}/${expectations.length} passed`,
          passed: true,
          expected: `One of ${expectations.length} expectation sets`,
          actual: `Expectation set ${passed.index + 1} matched`,
        },
        ...passed.results,
      ];
      return this.results;
    }

    // Żaden nie przeszedł - zwróć info + wyniki pierwszego (dla debugowania)
    if (expectations.length === 1) {
      this.results = expectationResults[0].results;
      return this.results;
    }

    this.results = [
      {
        name: `None of ${expectations.length} expectation sets passed`,
        passed: false,
        expected: `One of ${expectations.length} expectation sets`,
        actual: 'No expectation set matched',
      },
      ...expectationResults[0].results,
    ];
    return this.results;
  }

  /**
   * Sprawdza pojedynczy zestaw oczekiwań
   *
   * Kolejność sprawdzania:
   * 1. finalState (jeśli istnieje) - najpierw, bo decyduje o soft mode dla toolCalls
   * 2. toolCalls - jeśli finalState pasuje, required staje się soft check
   * 3. agentBehavior
   * 4. referenceTags
   */
  private checkSingleExpectation(
    expectations: ScenarioExpectations,
    toolCalls: ToolCall[],
    dataDiff: DataDiff,
    agentResponse?: string
  ): AssertionResult[] {
    const results: AssertionResult[] = [];

    // 1. Najpierw sprawdź finalState (jeśli istnieje)
    let finalStatePassed = true;
    if (expectations.finalState) {
      const finalStateChecker = new AssertionChecker();
      finalStateChecker.checkFinalState(expectations.finalState, dataDiff);
      results.push(...finalStateChecker.results);
      finalStatePassed = finalStateChecker.results.every((r) => r.passed);
    }

    // 2. Sprawdź toolCalls - jeśli finalState istnieje i pasuje, required staje się soft
    if (expectations.toolCalls) {
      const softMode = finalStatePassed && !!expectations.finalState;
      const toolCallsChecker = new AssertionChecker();
      toolCallsChecker.checkToolCalls(expectations.toolCalls, toolCalls, softMode);
      results.push(...toolCallsChecker.results);
    }

    // 3. agentBehavior
    if (expectations.agentBehavior) {
      const behaviorChecker = new AssertionChecker();
      behaviorChecker.checkAgentBehavior(expectations.agentBehavior, toolCalls, agentResponse);
      results.push(...behaviorChecker.results);
    }

    // 4. referenceTags
    if (expectations.referenceTags) {
      const tagsChecker = new AssertionChecker();
      tagsChecker.checkReferenceTags(expectations.referenceTags, agentResponse);
      results.push(...tagsChecker.results);
    }

    return results;
  }

  /**
   * Czy wszystkie asercje przeszły?
   *
   * Asercje z `softCheck=true` nie wpływają na wynik nawet gdy `passed=false`.
   */
  allPassed(): boolean {
    return this.results.every((r) => r.passed || r.softCheck);
  }

  // ============================================================================
  // TOOL CALL ASSERTIONS
  // ============================================================================

  /**
   * Sprawdza oczekiwania dotyczące wywołań narzędzi
   *
   * @param softMode - jeśli true, required tools stają się "soft check" (informacyjne, nie failują testu)
   *                   Używane gdy finalState jest zdefiniowany i pasuje.
   */
  private checkToolCalls(
    expectations: ToolCallExpectations,
    toolCalls: ToolCall[],
    softMode: boolean = false
  ): void {
    const calledTools = toolCalls.map((c) => c.toolName);
    const uniqueCalledTools = [...new Set(calledTools)];

    // Required tools - w softMode stają się informacyjne gdy nie wywołane
    if (expectations.required) {
      for (const required of expectations.required) {
        const called = uniqueCalledTools.includes(required);
        this.addResult({
          name: `Required tool '${required}' was called`,
          passed: called,
          // Jeśli softMode i tool nie wywołany → soft check (nie wpływa na allPassed)
          softCheck: softMode && !called,
          expected: required,
          actual: called ? required : 'not called',
          message: called
            ? undefined
            : softMode
              ? `Required tool '${required}' was not called (soft check - finalState OK)`
              : `Required tool '${required}' was not called`,
        });
      }
    }

    // Forbidden tools - ZAWSZE hard fail (BEZ softCheck)
    if (expectations.forbidden) {
      for (const forbidden of expectations.forbidden) {
        const called = uniqueCalledTools.includes(forbidden);
        this.addResult({
          name: `Forbidden tool '${forbidden}' was not called`,
          passed: !called,
          // forbidden zawsze jest błędem - bez softCheck
          expected: 'not called',
          actual: called ? 'called' : 'not called',
          message: called ? `Forbidden tool '${forbidden}' was called` : undefined,
        });
      }
    }

    // Order check - w softMode też staje się informacyjny
    if (expectations.order && expectations.order.length > 1) {
      const passed = this.checkOrder(expectations.order, calledTools);
      this.addResult({
        name: `Tools called in expected order: ${expectations.order.join(' → ')}`,
        passed,
        softCheck: softMode && !passed,
        expected: expectations.order.join(' → '),
        actual: calledTools.join(' → '),
        message: passed
          ? undefined
          : softMode
            ? `Tools were not called in expected order (soft check - finalState OK)`
            : `Tools were not called in expected order`,
      });
    }
  }

  private checkOrder(expectedOrder: string[], actualCalls: string[]): boolean {
    let lastIndex = -1;
    for (const tool of expectedOrder) {
      const index = actualCalls.indexOf(tool, lastIndex + 1);
      if (index === -1) return false;
      lastIndex = index;
    }
    return true;
  }

  // ============================================================================
  // FINAL STATE ASSERTIONS
  // ============================================================================

  private checkFinalState(expectations: FinalStateExpectations, dataDiff: DataDiff): void {
    // Blocks
    if (expectations.blocks) {
      // Added blocks
      if (expectations.blocks.added) {
        for (const expectedBlock of expectations.blocks.added) {
          const matchingBlock = dataDiff.blocks.added.find((b) =>
            this.matchesConditions(b.data, expectedBlock.match)
          );
          this.addResult({
            name: `Block added matching: ${JSON.stringify(expectedBlock.match)}`,
            passed: !!matchingBlock,
            expected: expectedBlock.match,
            actual: matchingBlock?.data || 'no matching block found',
            message: matchingBlock ? undefined : 'No matching block was added',
          });
        }
      }

      // Modified blocks
      if (expectations.blocks.modified) {
        for (const expectedMod of expectations.blocks.modified) {
          const matchingBlock = dataDiff.blocks.modified.find((b) =>
            this.matchesConditions(b.before, expectedMod.match)
          );

          if (!matchingBlock) {
            this.addResult({
              name: `Block modified matching: ${JSON.stringify(expectedMod.match)}`,
              passed: false,
              expected: expectedMod,
              actual: 'no matching block found',
              message: 'No matching block was modified',
            });
            continue;
          }

          // Check changes
          if (expectedMod.changes) {
            for (const [key, condition] of Object.entries(expectedMod.changes)) {
              const actualValue = (matchingBlock.after as Record<string, unknown>)[key];
              const passed = this.evaluateCondition(actualValue, condition);
              this.addResult({
                name: `Block '${matchingBlock.id}' field '${key}' matches condition`,
                passed,
                expected: condition,
                actual: actualValue,
                message: passed ? undefined : `Field '${key}' does not match expected condition`,
              });
            }
          }
        }
      }

      // Deleted blocks
      if (expectations.blocks.deleted) {
        for (const expectedId of expectations.blocks.deleted) {
          const deleted = dataDiff.blocks.deleted.some((b) => b.id === expectedId);
          this.addResult({
            name: `Block '${expectedId}' was deleted`,
            passed: deleted,
            expected: 'deleted',
            actual: deleted ? 'deleted' : 'not deleted',
            message: deleted ? undefined : `Block '${expectedId}' was not deleted`,
          });
        }
      }

      // Unchanged blocks
      if (expectations.blocks.unchanged) {
        for (const expectedId of expectations.blocks.unchanged) {
          const modified = dataDiff.blocks.modified.some((b) => b.id === expectedId);
          const deleted = dataDiff.blocks.deleted.some((b) => b.id === expectedId);
          const unchanged = !modified && !deleted;
          this.addResult({
            name: `Block '${expectedId}' was unchanged`,
            passed: unchanged,
            expected: 'unchanged',
            actual: modified ? 'modified' : deleted ? 'deleted' : 'unchanged',
            message: unchanged ? undefined : `Block '${expectedId}' was changed`,
          });
        }
      }
    }

    // Timelines
    if (expectations.timelines) {
      if (expectations.timelines.added) {
        for (const expected of expectations.timelines.added) {
          const matchingTimeline = dataDiff.timelines.added.find((t) =>
            this.matchesConditions(t.data, expected.match)
          );
          this.addResult({
            name: `Timeline added matching: ${JSON.stringify(expected.match)}`,
            passed: !!matchingTimeline,
            expected: expected.match,
            actual: matchingTimeline?.data || 'no matching timeline found',
          });
        }
      }

      if (expectations.timelines.deleted) {
        for (const expectedId of expectations.timelines.deleted) {
          const deleted = dataDiff.timelines.deleted.some((t) => t.id === expectedId);
          this.addResult({
            name: `Timeline '${expectedId}' was deleted`,
            passed: deleted,
            expected: 'deleted',
            actual: deleted ? 'deleted' : 'not deleted',
          });
        }
      }
    }

    // Media Assets
    if (expectations.mediaAssets) {
      if (expectations.mediaAssets.added) {
        for (const expected of expectations.mediaAssets.added) {
          const matchingAsset = dataDiff.mediaAssets.added.find((a) =>
            this.matchesConditions(a.data, expected.match)
          );
          this.addResult({
            name: `Media asset added matching: ${JSON.stringify(expected.match)}`,
            passed: !!matchingAsset,
            expected: expected.match,
            actual: matchingAsset?.data || 'no matching asset found',
          });
        }
      }
    }
  }

  // ============================================================================
  // AGENT BEHAVIOR ASSERTIONS
  // ============================================================================

  private checkAgentBehavior(
    expectations: AgentBehaviorExpectation,
    toolCalls: ToolCall[],
    agentResponse?: string
  ): void {
    // Handle oneOf - at least one must match
    if (expectations.oneOf && expectations.oneOf.length > 0) {
      const anyMatch = expectations.oneOf.some((exp) =>
        this.checkSingleBehavior(exp, toolCalls, agentResponse)
      );
      this.addResult({
        name: `Agent behavior matches one of ${expectations.oneOf.length} expected behaviors`,
        passed: anyMatch,
        expected: expectations.oneOf.map((e) => e.type).join(' or '),
        actual: anyMatch ? 'matched' : 'no match',
        message: anyMatch ? undefined : 'None of the expected behaviors matched',
      });
      return;
    }

    // Single expectation
    const passed = this.checkSingleBehavior(expectations, toolCalls, agentResponse);
    this.addResult({
      name: `Agent behavior: ${expectations.type}`,
      passed,
      expected: expectations.type,
      actual: passed ? expectations.type : 'different behavior',
      message: passed ? undefined : `Expected behavior '${expectations.type}' not observed`,
    });
  }

  private checkSingleBehavior(
    expectation: AgentBehaviorExpectation,
    toolCalls: ToolCall[],
    agentResponse?: string
  ): boolean {
    switch (expectation.type) {
      case 'clarification_question':
        if (!agentResponse) return false;
        if (expectation.pattern) {
          // Defensywne sprawdzenie - pattern może być RegExp, string lub {} po deserializacji JSON
          let regex: RegExp | null = null;
          if (expectation.pattern instanceof RegExp) {
            regex = expectation.pattern;
          } else if (typeof expectation.pattern === 'string' && expectation.pattern.length > 0) {
            regex = new RegExp(expectation.pattern, 'i');
          }
          // Jeśli pattern to {} (po JSON deserializacji) - fallback do domyślnego sprawdzenia
          if (regex) {
            return regex.test(agentResponse);
          }
          console.warn('[Assertions] Pattern is not a valid RegExp or string, falling back to question mark check');
        }
        // If no valid pattern, just check if response contains question marks
        return agentResponse.includes('?');

      case 'tool_call':
        if (!expectation.tool) return toolCalls.length > 0;
        const matchingCall = toolCalls.find((c) => c.toolName === expectation.tool);
        if (!matchingCall) return false;
        if (expectation.args) {
          return this.matchesConditions(matchingCall.input, expectation.args);
        }
        return true;

      case 'completion':
        // Agent completed without tool call or question
        return toolCalls.length === 0 && (!agentResponse || !agentResponse.includes('?'));

      default:
        return false;
    }
  }

  // ============================================================================
  // REFERENCE TAGS ASSERTIONS
  // ============================================================================

  private checkReferenceTags(
    expectations: ReferenceTagsExpectations,
    agentResponse?: string
  ): void {
    if (!agentResponse) {
      if (expectations.required?.length) {
        this.addResult({
          name: 'Reference tags: agent response exists',
          passed: false,
          expected: 'Agent response with reference tags',
          actual: 'No agent response',
        });
      }
      return;
    }

    const parsedTags = this.parseReferenceTags(agentResponse);

    // Helper do opisu oczekiwania
    const describeExpectation = (exp: ReferenceTagExpectation): string => {
      const attrsDesc = exp.attrs ? ` ${JSON.stringify(exp.attrs)}` : '';
      return `<${exp.tag}${attrsDesc}>`;
    };

    // Required
    if (expectations.required) {
      for (const expected of expectations.required) {
        const found = this.findMatchingTag(parsedTags, expected);
        if (!found) {
          this.addResult({
            name: `Required tag ${describeExpectation(expected)}`,
            passed: false,
            expected: expected,
            actual: parsedTags.filter((t) => t.tag === expected.tag),
          });
          continue;
        }

        // Jeśli jest warunek na label, sprawdź go osobno
        if (expected.label) {
          const labelPassed = this.evaluateCondition(found.label, expected.label);
          this.addResult({
            name: `Tag <${found.tag}> label`,
            passed: labelPassed,
            expected: expected.label,
            actual: found.label,
          });
        } else {
          this.addResult({
            name: `Required tag ${describeExpectation(expected)}`,
            passed: true,
            actual: found,
          });
        }
      }
    }

    // Forbidden
    if (expectations.forbidden) {
      for (const forbidden of expectations.forbidden) {
        const found = this.findMatchingTag(parsedTags, forbidden);
        this.addResult({
          name: `Forbidden tag ${describeExpectation(forbidden)}`,
          passed: !found,
          expected: 'not present',
          actual: found ? found.fullMatch : 'not present',
        });
      }
    }

    // minCount
    if (expectations.minCount) {
      for (const { tag, count } of expectations.minCount) {
        const actual = parsedTags.filter((t) => t.tag === tag).length;
        this.addResult({
          name: `Min ${count} <${tag}> tags`,
          passed: actual >= count,
          expected: `>= ${count}`,
          actual,
        });
      }
    }

    // maxCount
    if (expectations.maxCount) {
      for (const { tag, count } of expectations.maxCount) {
        const actual = parsedTags.filter((t) => t.tag === tag).length;
        this.addResult({
          name: `Max ${count} <${tag}> tags`,
          passed: actual <= count,
          expected: `<= ${count}`,
          actual,
        });
      }
    }
  }

  /**
   * Parsuje tagi referencyjne z odpowiedzi agenta
   *
   * Obsługuje formaty:
   * - <block id="abc" type="video">label</block>
   * - <block>label</block>
   * - <block id="abc" />
   */
  private parseReferenceTags(response: string): ParsedReferenceTag[] {
    const tags: ParsedReferenceTag[] = [];

    // Helper do wyciągania wszystkich atrybutów
    const parseAttrs = (attrsString: string | undefined): Record<string, string> => {
      const attrs: Record<string, string> = {};
      if (!attrsString) return attrs;

      // Regex dla atrybutów: name="value"
      const attrRegex = /(\w+)="([^"]*)"/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(attrsString)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }
      return attrs;
    };

    // Tagi z zawartością: <tag ...>label</tag>
    const tagWithContentRegex = /<(\w+)(\s[^>]*)?>([^<]*)<\/\1>/g;
    let match;
    while ((match = tagWithContentRegex.exec(response)) !== null) {
      tags.push({
        tag: match[1],
        attrs: parseAttrs(match[2]),
        label: match[3].trim(),
        fullMatch: match[0],
      });
    }

    // Self-closing: <tag ... />
    const selfClosingRegex = /<(\w+)(\s[^>]*)?\/>/g;
    while ((match = selfClosingRegex.exec(response)) !== null) {
      tags.push({
        tag: match[1],
        attrs: parseAttrs(match[2]),
        label: '',
        fullMatch: match[0],
      });
    }

    return tags;
  }

  /**
   * Znajduje tag pasujący do oczekiwania
   */
  private findMatchingTag(
    parsedTags: ParsedReferenceTag[],
    expectation: ReferenceTagExpectation
  ): ParsedReferenceTag | undefined {
    return parsedTags.find((tag) => {
      // Sprawdź typ tagu
      if (tag.tag !== expectation.tag) return false;

      // Sprawdź atrybuty (jeśli podano)
      if (expectation.attrs) {
        if (!this.matchesConditions(tag.attrs, expectation.attrs)) {
          return false;
        }
      }

      return true;
    });
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private matchesConditions(obj: Record<string, unknown>, conditions: Record<string, unknown>): boolean {
    for (const [key, condition] of Object.entries(conditions)) {
      if (condition === undefined) continue;

      const value = obj[key];

      // Simple equality
      if (typeof condition !== 'object' || condition === null) {
        if (value !== condition) return false;
        continue;
      }

      // MatchCondition
      if (!this.evaluateCondition(value, condition as MatchCondition)) {
        return false;
      }
    }
    return true;
  }

  private evaluateCondition(value: unknown, condition: MatchCondition): boolean {
    if (condition.equals !== undefined) {
      return value === condition.equals;
    }

    if (condition.oneOf !== undefined) {
      return condition.oneOf.includes(value as string | number | boolean);
    }

    if (typeof value === 'number') {
      if (condition.gte !== undefined && value < condition.gte) return false;
      if (condition.lte !== undefined && value > condition.lte) return false;
      if (condition.gt !== undefined && value <= condition.gt) return false;
      if (condition.lt !== undefined && value >= condition.lt) return false;
    }

    if (typeof value === 'string') {
      if (condition.contains !== undefined && !value.includes(condition.contains)) return false;
      if (condition.matches !== undefined && !new RegExp(condition.matches).test(value)) return false;
    }

    return true;
  }

  private addResult(result: AssertionResult): void {
    this.results.push(result);
  }
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

export function checkExpectations(
  expectations: ScenarioExpectations[],
  toolCalls: ToolCall[],
  dataDiff: DataDiff,
  agentResponse?: string
): { assertions: AssertionResult[]; allPassed: boolean } {
  const checker = new AssertionChecker();
  const assertions = checker.check(expectations, toolCalls, dataDiff, agentResponse);
  return {
    assertions,
    allPassed: checker.allPassed(),
  };
}
