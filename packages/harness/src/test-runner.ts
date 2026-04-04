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
    // TE-03: saga structural validation
    if (testCase.momentId.startsWith('saga-')) {
      return this.evaluateSagaTestCase(testCase, ir);
    }

    // TE-04: policy chain structural validation
    if (testCase.momentId.startsWith('policy-')) {
      return this.evaluatePolicyTestCase(testCase, ir);
    }

    return this.evaluateMomentTestCase(testCase, flow, ir);
  }

  private evaluateMomentTestCase(
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

  // TE-03: Saga structural validation against the IR
  private evaluateSagaTestCase(
    testCase: TestCaseDefinition,
    ir: IntermediateRepresentation,
  ): boolean {
    const sagaName = this.extractSagaName(testCase.momentId);
    if (!sagaName) return false;

    const { saga, context } = this.findSaga(sagaName, ir);
    if (!saga || !context) return false;

    if (testCase.momentId.endsWith('-compensation')) {
      return saga.compensation.length > 0 && saga.timeout.length > 0;
    }

    if (testCase.momentId.endsWith('-initiated')) {
      return this.eventExistsInIr(saga.trigger, ir);
    }

    // Transition case: saga-{name}-{fromState}-to-{toState}
    return this.evaluateSagaTransition(testCase.momentId, saga);
  }

  private extractSagaName(momentId: string): string | undefined {
    // saga-{name}-initiated | saga-{name}-compensation | saga-{name}-{from}-to-{to}
    const withoutPrefix = momentId.slice('saga-'.length);

    if (withoutPrefix.endsWith('-initiated')) {
      return withoutPrefix.slice(0, -'-initiated'.length);
    }
    if (withoutPrefix.endsWith('-compensation')) {
      return withoutPrefix.slice(0, -'-compensation'.length);
    }

    // Transition: {name}-{fromState}-to-{toState}
    const toIdx = withoutPrefix.lastIndexOf('-to-');
    if (toIdx === -1) return undefined;

    const nameAndFrom = withoutPrefix.slice(0, toIdx);
    const dashIdx = nameAndFrom.lastIndexOf('-');
    if (dashIdx === -1) return undefined;

    return nameAndFrom.slice(0, dashIdx);
  }

  private findSaga(
    sagaName: string,
    ir: IntermediateRepresentation,
  ): { saga: SagaDefinition | undefined; context: ContextDefinition | undefined } {
    for (const ctx of ir.contexts) {
      const saga = ctx.sagas.find((s) => s.name === sagaName);
      if (saga) return { saga, context: ctx };
    }
    return { saga: undefined, context: undefined };
  }

  private evaluateSagaTransition(momentId: string, saga: SagaDefinition): boolean {
    const withoutPrefix = momentId.slice('saga-'.length);
    const toIdx = withoutPrefix.lastIndexOf('-to-');
    if (toIdx === -1) return false;

    const nameAndFrom = withoutPrefix.slice(0, toIdx);
    const toState = withoutPrefix.slice(toIdx + '-to-'.length);
    const fromState = nameAndFrom.slice(saga.name.length + 1);

    const fromIdx = saga.states.indexOf(fromState);
    const toStateIdx = saga.states.indexOf(toState);

    return fromIdx !== -1 && toStateIdx !== -1 && toStateIdx === fromIdx + 1;
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

    const triggerExists = this.eventExistsInIr(policy.trigger, ir);
    if (!triggerExists) return false;

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
