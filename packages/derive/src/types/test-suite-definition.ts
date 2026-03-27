import type { TestCaseDefinition } from './test-case-definition.js';

export interface TestSuiteDefinition {
  readonly flowId: string;
  readonly flowName: string;
  readonly testCases: TestCaseDefinition[];
  readonly contextsCovered: string[];
}
