import type {
  TestSuiteDefinition,
  TestCaseDefinition,
  SetupStep,
  AssertionPoint,
  FieldConstraint,
} from '@mmmnt/derive';

/**
 * Renders a TestSuiteDefinition into a Gherkin .feature file string.
 * Pure function: topology suite in, string out. No I/O.
 */
export function renderFeature(suite: TestSuiteDefinition): string {
  const lines: string[] = [];

  lines.push(`Feature: ${suite.flowName}`);
  lines.push('');

  for (const testCase of suite.testCases) {
    renderScenario(lines, testCase);
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

function renderScenario(lines: string[], testCase: TestCaseDefinition): void {
  const label = testCase.variant
    ? `${testCase.frameName} [${testCase.variant}]`
    : testCase.frameName;

  lines.push(`  Scenario: ${label}`);

  for (const setup of testCase.setupSteps) {
    renderSetupStep(lines, setup);
  }

  for (const assertion of testCase.assertions) {
    renderAssertionSteps(lines, assertion);
  }
}

function renderSetupStep(lines: string[], step: SetupStep): void {
  lines.push(`    Given ${step.precondition}`);
}

function renderAssertionSteps(lines: string[], assertion: AssertionPoint): void {
  const event = assertion.schemaContract.eventType;

  if (assertion.sourceContext !== assertion.targetContext) {
    lines.push(
      `    When ${event} crosses from ${assertion.sourceContext} to ${assertion.targetContext}`,
    );
  } else {
    lines.push(`    When ${event} is emitted`);
  }

  lines.push(`    Then ${event} payload is valid`);

  if (assertion.schemaContract.expectedFields.length > 0) {
    renderExamplesTable(lines, assertion.schemaContract.expectedFields);
  }
}

function renderExamplesTable(lines: string[], fields: readonly FieldConstraint[]): void {
  lines.push('    Examples:');

  const headers = fields.map((f) => f.fieldName);
  const types = fields.map((f) => f.expectedType);
  const required = fields.map((f) => (f.required ? 'required' : 'optional'));

  lines.push(`      | ${headers.join(' | ')} |`);
  lines.push(`      | ${types.join(' | ')} |`);
  lines.push(`      | ${required.join(' | ')} |`);
}
