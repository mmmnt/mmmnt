import type { IntermediateRepresentation, FlowDefinition } from '@mmmnt/core';
import type { TestSuiteTopology, TestSuiteDefinition, TestCaseDefinition } from '@mmmnt/derive';
import type { TestRunResult } from './types/index.js';

/**
 * TestRunner runs derived test suites against an IntermediateRepresentation,
 * producing a TestRunResult with full traceability to originating specification elements.
 *
 * Invariant TE-01: every test result includes traceability to originating specification element.
 */
export class TestRunner {
  run(topology: TestSuiteTopology, ir: IntermediateRepresentation): TestRunResult {
    const flowIndex = new Map<string, FlowDefinition>(ir.flows.map((f) => [f.id, f]));

    let testsPassed = 0;
    let testsFailed = 0;
    let testsSkipped = 0;
    const traceabilityMap: Record<string, string> = {};

    for (const suite of topology.suites) {
      const flow = flowIndex.get(suite.flowId);

      for (const testCase of suite.testCases) {
        const testId = this.buildTestId(suite, testCase);
        const specElementId = this.resolveSpecElement(suite, testCase);

        // TE-01: every test maps to a spec element
        traceabilityMap[testId] = specElementId;

        if (!flow) {
          testsSkipped++;
          continue;
        }

        const passed = this.evaluateTestCase(testCase, flow, ir);
        if (passed) {
          testsPassed++;
        } else {
          testsFailed++;
        }
      }
    }

    return {
      suitesRun: topology.suites.length,
      testsPassed,
      testsFailed,
      testsSkipped,
      traceabilityMap,
    };
  }

  private buildTestId(suite: TestSuiteDefinition, testCase: TestCaseDefinition): string {
    const variant = testCase.variant ? `[${testCase.variant}]` : '';
    return `${suite.flowId}::${testCase.momentId}${variant}`;
  }

  private resolveSpecElement(suite: TestSuiteDefinition, testCase: TestCaseDefinition): string {
    if (testCase.assertions.length > 0) {
      return testCase.assertions[0].crossingId;
    }
    return `${suite.flowId}/${testCase.momentId}`;
  }

  private evaluateTestCase(
    testCase: TestCaseDefinition,
    flow: FlowDefinition,
    ir: IntermediateRepresentation,
  ): boolean {
    const momentExists = flow.moments.some((f) => f.id === testCase.momentId);
    if (!momentExists) {
      return false;
    }

    for (const setup of testCase.setupSteps) {
      const contextExists = ir.contexts.some((c) => c.name === setup.contextName);
      if (!contextExists) {
        return false;
      }
    }

    for (const assertion of testCase.assertions) {
      const sourceExists = ir.contexts.some((c) => c.id === assertion.sourceContext);
      const targetExists = ir.contexts.some((c) => c.id === assertion.targetContext);
      if (!sourceExists || !targetExists) {
        return false;
      }
    }

    return true;
  }
}
