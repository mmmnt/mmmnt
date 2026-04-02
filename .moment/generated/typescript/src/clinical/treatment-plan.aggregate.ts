import type { ConfirmTreatment, CreateTreatmentPlan, Medication, TreatmentConfirmed, TreatmentPlanCreated, TriageResults, VitalSigns } from './treatment-plan.types.js';

/**
 * Aggregate root for TreatmentPlan.
 */
export interface TreatmentPlanAggregate {
  readonly planId: string;
  /**
   * Handle CreateTreatmentPlan.
   * @precondition Clinical assessment must be completed
   * @emits TreatmentPlanCreated
   */
  createTreatmentPlan(command: CreateTreatmentPlan): TreatmentPlanCreated;
  /**
   * Handle ConfirmTreatment.
   * @precondition Treatment plan must exist
   * @emits TreatmentConfirmed
   */
  confirmTreatment(command: ConfirmTreatment): TreatmentConfirmed;
}
