import type { ConfirmTreatment, CreateTreatmentPlan, Medication, TreatmentConfirmed, TreatmentPlanCreated, TriageResults, VitalSigns } from './treatment-plan.types.js';

/**
 * Aggregate root for TreatmentPlan.
 */
export interface TreatmentPlanAggregate {
  readonly planId: string;
  createTreatmentPlan(command: CreateTreatmentPlan): TreatmentPlanCreated;
  confirmTreatment(command: ConfirmTreatment): TreatmentConfirmed;
}
