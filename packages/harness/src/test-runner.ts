import type {
  IntermediateRepresentation,
  FlowDefinition,
  ContextDefinition,
  SagaDefinition,
  PolicyDefinition,
} from '@mmmnt/core';
import type { TestSuiteTopology, TestSuiteDefinition, TestCaseDefinition } from '@mmmnt/derive';
import type { TestRunResult } from './types/index.js';

/**
 * TestRunner runs derived test suites against an IntermediateRepresentation,
 * producing a TestRunResult with full traceability to originating specification elements.
 *
 * Invariant TE-01: every test result includes traceability to originating specification element.
 * Invariant TE-03: saga structural test cases validate trigger event existence,
 *                   state adjacency, and compensation definition against the IR.
 * Invariant TE-04: policy chain test cases validate trigger event existence
 *                   and chainsTo command existence against the IR.
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
    // Common baseline: validate setup contexts and assertion contexts exist
    if (!this.validateBaselineContexts(testCase, ir)) {
      return false;
    }

    // Dispatch on assertionType from the test case's assertions
    const assertionType = this.resolveAssertionType(testCase);

    if (assertionType === 'saga') {
      return this.evaluateSagaTestCase(testCase, ir);
    }

    if (assertionType === 'policy-chain') {
      return this.evaluatePolicyTestCase(testCase, ir);
    }

    return this.evaluateMomentTestCase(testCase, flow);
  }

  private resolveAssertionType(testCase: TestCaseDefinition): string | undefined {
    if (testCase.assertions.length === 0) return undefined;
    return testCase.assertions[0].assertionType;
  }

  private validateBaselineContexts(
    testCase: TestCaseDefinition,
    ir: IntermediateRepresentation,
  ): boolean {
    for (const setup of testCase.setupSteps) {
      if (!ir.contexts.some((c) => c.name === setup.contextName)) {
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

  private evaluateMomentTestCase(testCase: TestCaseDefinition, flow: FlowDefinition): boolean {
    return flow.moments.some((f) => f.id === testCase.momentId);
  }

  // TE-03: Saga structural validation against the IR
  private evaluateSagaTestCase(
    testCase: TestCaseDefinition,
    ir: IntermediateRepresentation,
  ): boolean {
    const sagaName = this.extractSagaName(testCase.momentId);

    // For transition cases, extractSagaName returns undefined because we can't
    // reliably parse the saga name from hyphenated state names. Scan all sagas.
    if (!sagaName) {
      return this.evaluateSagaTransitionByScan(testCase.momentId, ir);
    }

    const saga = this.findSaga(sagaName, ir);
    if (!saga) return false;

    if (testCase.momentId.endsWith('-compensation')) {
      return saga.compensation.length > 0 && saga.timeout.length > 0;
    }

    if (testCase.momentId.endsWith('-initiated')) {
      return this.eventExistsInIr(saga.trigger, ir);
    }

    return this.evaluateSagaTransition(testCase.momentId, saga);
  }

  private extractSagaName(momentId: string): string | undefined {
    const withoutPrefix = momentId.slice('saga-'.length);

    if (withoutPrefix.endsWith('-initiated')) {
      return withoutPrefix.slice(0, -'-initiated'.length);
    }
    if (withoutPrefix.endsWith('-compensation')) {
      return withoutPrefix.slice(0, -'-compensation'.length);
    }

    // Transition — saga name is extracted by findSaga matching, not delimiter parsing
    return undefined;
  }

  private findSaga(sagaName: string, ir: IntermediateRepresentation): SagaDefinition | undefined {
    for (const ctx of ir.contexts) {
      const saga = ctx.sagas.find((s) => s.name === sagaName);
      if (saga) return saga;
    }
    return undefined;
  }

  /**
   * Evaluates saga transitions by forward-matching against expected momentIds
   * built from consecutive state pairs. Avoids fragile delimiter-based parsing
   * of state names that may contain hyphens.
   */
  private evaluateSagaTransition(momentId: string, saga: SagaDefinition): boolean {
    for (let i = 0; i < saga.states.length - 1; i++) {
      const expected = `saga-${saga.name}-${saga.states[i]}-to-${saga.states[i + 1]}`;
      if (momentId === expected) return true;
    }
    return false;
  }

  private evaluateSagaTransitionByScan(momentId: string, ir: IntermediateRepresentation): boolean {
    for (const ctx of ir.contexts) {
      for (const saga of ctx.sagas) {
        if (this.evaluateSagaTransition(momentId, saga)) return true;
      }
    }
    return false;
  }

  private eventExistsInContext(eventName: string, context: ContextDefinition): boolean {
    if (context.events.some((e) => e.name === eventName)) return true;
    for (const agg of context.aggregates) {
      if (agg.events.some((e) => e.name === eventName)) return true;
    }
    return false;
  }

  // TE-04: Policy chain structural validation against the IR
  private evaluatePolicyTestCase(
    testCase: TestCaseDefinition,
    ir: IntermediateRepresentation,
  ): boolean {
    const policyName = testCase.momentId.slice('policy-'.length);
    const policy = this.findPolicy(policyName, ir);
    if (!policy) return false;

    if (!this.eventExistsInIr(policy.trigger, ir)) return false;

    if (policy.chainsTo) {
      return this.commandExistsInIr(policy.chainsTo, ir);
    }

    return true;
  }

  private findPolicy(
    policyName: string,
    ir: IntermediateRepresentation,
  ): PolicyDefinition | undefined {
    for (const ctx of ir.contexts) {
      const policy = ctx.policies.find((p) => p.name === policyName);
      if (policy) return policy;
    }
    return undefined;
  }

  private eventExistsInIr(eventName: string, ir: IntermediateRepresentation): boolean {
    for (const ctx of ir.contexts) {
      if (this.eventExistsInContext(eventName, ctx)) return true;
    }
    return false;
  }

  private commandExistsInIr(commandName: string, ir: IntermediateRepresentation): boolean {
    for (const ctx of ir.contexts) {
      if (ctx.commands.some((c) => c.name === commandName)) return true;
      for (const agg of ctx.aggregates) {
        if (agg.commands.some((c) => c.name === commandName)) return true;
      }
    }
    return false;
  }
}
