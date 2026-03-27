import type { AssertionPoint } from './assertion-point.js';
import type { SetupStep } from './setup-step.js';

export interface TestCaseDefinition {
  readonly frameId: string;
  readonly frameName: string;
  readonly assertions: AssertionPoint[];
  readonly setupSteps: SetupStep[];
  readonly variant?: string;
}
