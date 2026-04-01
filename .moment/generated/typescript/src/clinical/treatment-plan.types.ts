/**
 * Types for the TreatmentPlan aggregate.
 */

export interface TriageResults {
  readonly weight: string;
  readonly temperature: string;
  readonly heartRate: string;
  readonly chiefComplaint: string;
  readonly urgency: string;
}

export interface VitalSigns {
  readonly weight: string;
  readonly temperature: string;
  readonly heartRate: string;
}

export interface Medication {
  readonly name: string;
  readonly dose: string;
  readonly frequency: string;
}

export interface CreateTreatmentPlan {
  readonly visitId: string;
  readonly patientId: string;
  readonly diagnosis: string;
  readonly medications: readonly Medication[];
}

export interface ConfirmTreatment {
  readonly planId: string;
  readonly confirmedBy: string;
  readonly rationale: string;
}

export interface TreatmentPlanCreated {
  readonly planId: string;
  readonly visitId: string;
  readonly patientId: string;
  readonly diagnosis: string;
  readonly medications: readonly Medication[];
  readonly instructions: string;
  readonly createdAt: DateTime;
}

export interface TreatmentConfirmed {
  readonly planId: string;
  readonly confirmedBy: string;
  readonly rationale: string;
  readonly confirmedAt: DateTime;
}
