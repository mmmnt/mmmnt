export * from './visit-record.types.js';
export * from './visit-record.aggregate.js';
export * from './treatment-plan.types.js';
export * from './treatment-plan.aggregate.js';

import type { TriageCompleted, DualVetAssessmentCompleted, ClinicalObservationRecorded, ClinicalRecordNormalized, ClinicalAssessmentCompleted } from './visit-record.types.js';
import type { TreatmentPlanCreated, TreatmentConfirmed } from './treatment-plan.types.js';

export type ClinicalEvent = ClinicalAssessmentCompleted | ClinicalObservationRecorded | ClinicalRecordNormalized | DualVetAssessmentCompleted | TreatmentConfirmed | TreatmentPlanCreated | TriageCompleted;

