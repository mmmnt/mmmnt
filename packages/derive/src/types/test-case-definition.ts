import type { AssertionPoint } from './assertion-point.js';
import type { SetupStep } from './setup-step.js';

export interface TestCaseDefinition {
  readonly momentId: string;
  readonly momentName: string;
  readonly assertions: AssertionPoint[];
  readonly setupSteps: SetupStep[];
  readonly variant?: string;
}
