import type { PayloadValidationStep } from './payload-validation-step.js';

export interface AssertionPoint {
  readonly crossingId: string;
  readonly sourceContext: string;
  readonly targetContext: string;
  readonly schemaContract: PayloadValidationStep;
  readonly assertionType: 'payload' | 'state';
}
