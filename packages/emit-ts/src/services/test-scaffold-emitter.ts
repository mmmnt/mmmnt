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

function escapeQuotes(s: string): string {
  return s.replace(/'/g, "\\'");
}

function generateSetupComment(step: SetupStep): string {
  return `      // Setup: ${step.contextName}.${step.aggregateName} — ${step.precondition}`;
}

function generateAssertionIt(assertion: AssertionPoint): string {
  const eventType = assertion.schemaContract.eventType;
  const source = assertion.sourceContext;
  const target = assertion.targetContext;
  const lines: string[] = [];
  lines.push(
    `    it('should verify ${escapeQuotes(eventType)} crosses from ${escapeQuotes(source)} to ${escapeQuotes(target)}', () => {`,
  );
  lines.push(`      // Crossing: ${assertion.crossingId}`);
  lines.push(`      // Assertion type: ${assertion.assertionType}`);
  if (assertion.schemaContract.expectedFields.length > 0) {
    lines.push(`      // Expected fields:`);
    for (const field of assertion.schemaContract.expectedFields) {
      lines.push(
        `      //   ${field.fieldName}: ${field.expectedType} (${field.required ? 'required' : 'optional'})`,
      );
    }
  }
  lines.push(`      // TODO: implement assertion`);
  lines.push(`    });`);
  return lines.join('\n');
}

function generateTestCase(testCase: TestCaseDefinition): string {
  const lines: string[] = [];
  lines.push(`  describe('${escapeQuotes(testCase.frameName)}', () => {`);

  if (testCase.setupSteps.length > 0) {
    lines.push(`    beforeEach(() => {`);
    for (const step of testCase.setupSteps) {
      lines.push(generateSetupComment(step));
    }
    lines.push(`    });`);
    lines.push('');
  }

  for (const assertion of testCase.assertions) {
    lines.push(generateAssertionIt(assertion));
    lines.push('');
  }

  // Remove trailing empty line before closing
  if (lines[lines.length - 1] === '') {
    lines.pop();
  }

  lines.push(`  });`);
  return lines.join('\n');
}

function hasAnySetupSteps(suite: TestSuiteDefinition): boolean {
  return suite.testCases.some((tc) => tc.setupSteps.length > 0);
}

function generateFlowSpecFile(suite: TestSuiteDefinition): string {
  const lines: string[] = [];
  const needsBeforeEach = hasAnySetupSteps(suite);
  if (needsBeforeEach) {
    lines.push("import { describe, it, beforeEach, expect } from 'vitest';");
  } else {
    lines.push("import { describe, it, expect } from 'vitest';");
  }
  lines.push('');
  lines.push(`describe('${escapeQuotes(suite.flowName)}', () => {`);

  for (let i = 0; i < suite.testCases.length; i++) {
    lines.push(generateTestCase(suite.testCases[i]));
    if (i < suite.testCases.length - 1) {
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
  lines.push(`describe('${escapeQuotes(aggregate.name)}', () => {`);

  for (const command of aggregate.commands) {
    lines.push(`  it('should handle ${escapeQuotes(command.name)}', () => {`);
    lines.push(`    // TODO: implement`);
    lines.push(`  });`);
    lines.push('');
  }

  for (const invariant of aggregate.invariants) {
    lines.push(`  it('should enforce invariant: ${escapeQuotes(invariant.description)}', () => {`);
    lines.push(`    // TODO: implement invariant violation test`);
    lines.push(`  });`);
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

    // Generate per-flow spec files (TG-03)
    for (const suite of topology.suites) {
      const fileName = `__tests__/flows/${toKebabCase(suite.flowName)}.spec.ts`;
      const content = generateFlowSpecFile(suite);
      files.set(fileName, content);
      specFilesWritten.push(fileName);
    }

    // Generate per-aggregate spec files
    const allAggregates: AggregateDefinition[] = [];
    for (const context of ir.contexts) {
      for (const aggregate of context.aggregates) {
        allAggregates.push(aggregate);
        const contextDir = toKebabCase(context.name);
        const fileName = `__tests__/${contextDir}/${toKebabCase(aggregate.name)}.spec.ts`;
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
