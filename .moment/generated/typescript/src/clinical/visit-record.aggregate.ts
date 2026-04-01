import type { ClinicalAssessmentCompleted, ClinicalObservationRecorded, ClinicalRecordNormalized, CompleteTriage, DualVetAssessmentCompleted, NormalizeClinicalRecord, PerformDualVetAssessment, RecordClinicalObservation, RunClinicalAssessment, TriageCompleted } from './visit-record.types.js';

/**
 * Aggregate root for VisitRecord.
 */
export interface VisitRecordAggregate {
  readonly visitId: string;
  completeTriage(command: CompleteTriage): TriageCompleted;
  performDualVetAssessment(command: PerformDualVetAssessment): DualVetAssessmentCompleted;
  recordClinicalObservation(command: RecordClinicalObservation): ClinicalObservationRecorded;
  normalizeClinicalRecord(command: NormalizeClinicalRecord): ClinicalRecordNormalized;
  runClinicalAssessment(command: RunClinicalAssessment): ClinicalAssessmentCompleted;
}
