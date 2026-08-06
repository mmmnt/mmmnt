import type {
  IntermediateRepresentation,
  AggregateDefinition,
  InvariantDefinition,
} from '@mmmnt/core';
import type {
  TestSuiteTopology,
  TestSuiteDefinition,
  TestCaseDefinition,
  AssertionPoint,
  SetupStep,
} from '@mmmnt/derive';
import type { TestScaffoldResult } from '../types/index.js';

export interface TestScaffoldEmitterOutput {
  readonly result: TestScaffoldResult;
  readonly files: Map<string, string>;
}

function toKebabCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\s+/g, '-')
    .toLowerCase();
}

function safePathSegment(name: string): string {
  return toKebabCase(name)
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeStringLiteral(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/'/g, "\\'");
}

function sanitizeComment(s: string): string {
  return s.replace(/\r?\n/g, ' ');
}

function generateSetupComment(step: SetupStep): string {
  return `      // Setup: ${sanitizeComment(step.contextName)}.${sanitizeComment(step.aggregateName)} — ${sanitizeComment(step.precondition)}`;
}

/**
 * Names the scaffolded test for what it actually verifies. Crossing-shaped
 * names are reserved for payload assertions; saga and policy cases describe
 * the transition or chain they check instead of a fabricated crossing.
 */
function assertionTestName(assertion: AssertionPoint, testCase: TestCaseDefinition): string {
  if (assertion.assertionType === 'saga' || assertion.assertionType === 'policy-chain') {
    return `should verify ${escapeStringLiteral(testCase.momentName)}`;
  }
  const eventType = assertion.schemaContract.eventType;
  const source = assertion.sourceContext;
  const target = assertion.targetContext;
  return `should verify ${escapeStringLiteral(eventType)} crosses from ${escapeStringLiteral(source)} to ${escapeStringLiteral(target)}`;
}

function generateAssertionIt(assertion: AssertionPoint, testCase: TestCaseDefinition): string {
  const lines: string[] = [];
  lines.push(`    // Crossing: ${assertion.crossingId}`);
  lines.push(`    // Assertion type: ${assertion.assertionType}`);
  if (assertion.schemaContract.expectedFields.length > 0) {
    lines.push(`    // Expected fields:`);
    for (const field of assertion.schemaContract.expectedFields) {
      lines.push(
        `    //   ${field.fieldName}: ${field.expectedType} (${field.required ? 'required' : 'optional'})`,
      );
    }
  }
  // it.todo keeps the scaffold honest: an unimplemented assertion is reported
  // as todo instead of silently passing CI with an empty body.
  lines.push(`    it.todo('${assertionTestName(assertion, testCase)}');`);
  return lines.join('\n');
}

function describeName(testCase: TestCaseDefinition): string {
  const base = escapeStringLiteral(testCase.momentName);
  return testCase.variant ? `${base} [${escapeStringLiteral(testCase.variant)}]` : base;
}

function generateTestCase(testCase: TestCaseDefinition): string {
  const lines: string[] = [];
  lines.push(`  describe('${describeName(testCase)}', () => {`);

  if (testCase.setupSteps.length > 0) {
    lines.push(`    beforeEach(() => {`);
    for (const step of testCase.setupSteps) {
      lines.push(generateSetupComment(step));
    }
    lines.push(`    });`);
    lines.push('');
  }

  for (const assertion of testCase.assertions) {
    lines.push(generateAssertionIt(assertion, testCase));
    lines.push('');
  }

  // Remove trailing empty line before closing
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  lines.push(`  });`);
  return lines.join('\n');
}

/**
 * Test cases with no assertions would render as empty describe blocks that
 * assert nothing — skip them so the scaffold only contains real obligations.
 */
function renderableTestCases(suite: TestSuiteDefinition): TestCaseDefinition[] {
  return suite.testCases.filter((tc) => tc.assertions.length > 0);
}

function generateFlowSpecFile(suite: TestSuiteDefinition, testCases: TestCaseDefinition[]): string {
  const lines: string[] = [];
  const needsBeforeEach = testCases.some((tc) => tc.setupSteps.length > 0);
  if (needsBeforeEach) {
    lines.push("import { describe, it, beforeEach, expect } from 'vitest';");
  } else {
    lines.push("import { describe, it, expect } from 'vitest';");
  }
  lines.push('');
  lines.push(`describe('${escapeStringLiteral(suite.flowName)}', () => {`);

  for (let i = 0; i < testCases.length; i++) {
    lines.push(generateTestCase(testCases[i]));
    if (i < testCases.length - 1) {
      lines.push('');
    }
  }

  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function generateAggregateSpecFile(aggregate: AggregateDefinition): string {
  const lines: string[] = [];
  lines.push("import { describe, it, expect } from 'vitest';");
  lines.push('');
  lines.push(`describe('${escapeStringLiteral(aggregate.name)}', () => {`);

  for (const command of aggregate.commands) {
    lines.push(`  it.todo('should handle ${escapeStringLiteral(command.name)}');`);
    lines.push('');
  }

  for (const invariant of aggregate.invariants) {
    lines.push(`  // TODO: implement invariant violation test`);
    lines.push(
      `  it.todo('should enforce invariant: ${escapeStringLiteral(invariant.description)}');`,
    );
    lines.push('');
  }

  // Remove trailing empty line before closing
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  lines.push('});');
  lines.push('');
  return lines.join('\n');
}

function countScenarios(topology: TestSuiteTopology, aggregates: AggregateDefinition[]): number {
  let count = 0;

  for (const suite of topology.suites) {
    for (const testCase of suite.testCases) {
      count += testCase.assertions.length;
    }
  }

  for (const aggregate of aggregates) {
    count += aggregate.commands.length;
    count += aggregate.invariants.length;
  }

  return count;
}

export class TestScaffoldEmitter {
  emit(ir: IntermediateRepresentation, topology: TestSuiteTopology): TestScaffoldEmitterOutput {
    const files = new Map<string, string>();
    const specFilesWritten: string[] = [];

    // Generate per-flow spec files (TG-03). Suites whose test cases carry no
    // assertions are skipped entirely — an all-empty spec file asserts nothing.
    for (const suite of topology.suites) {
      const testCases = renderableTestCases(suite);
      if (testCases.length === 0) continue;
      const fileName = `__tests__/flows/${safePathSegment(suite.flowName)}.spec.ts`;
      const content = generateFlowSpecFile(suite, testCases);
      files.set(fileName, content);
      specFilesWritten.push(fileName);
    }

    // Generate per-aggregate spec files
    const allAggregates: AggregateDefinition[] = [];
    for (const context of ir.contexts) {
      for (const aggregate of context.aggregates) {
        allAggregates.push(aggregate);
        // Skip aggregates with nothing to test — no empty describe blocks.
        if (aggregate.commands.length === 0 && aggregate.invariants.length === 0) continue;
        const contextDir = safePathSegment(context.name);
        const fileName = `__tests__/${contextDir}/${safePathSegment(aggregate.name)}.spec.ts`;
        const content = generateAggregateSpecFile(aggregate);
        files.set(fileName, content);
        specFilesWritten.push(fileName);
      }
    }

    const scenariosGenerated = countScenarios(topology, allAggregates);

    const result: TestScaffoldResult = {
      specFilesWritten,
      scenariosGenerated,
    };

    return { result, files };
  }
}
