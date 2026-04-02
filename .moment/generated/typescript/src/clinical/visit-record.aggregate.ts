import type { ClinicalAssessmentCompleted, ClinicalObservationRecorded, ClinicalRecordNormalized, CompleteTriage, DualVetAssessmentCompleted, NormalizeClinicalRecord, PerformDualVetAssessment, RecordClinicalObservation, RunClinicalAssessment, TriageCompleted } from './visit-record.types.js';

/**
 * Aggregate root for VisitRecord.
 */
export interface VisitRecordAggregate {
  readonly visitId: string;
  /**
   * Handle CompleteTriage.
   * @precondition Patient must be registered through intake
   * @emits TriageCompleted
   */
  completeTriage(command: CompleteTriage): TriageCompleted;
  /**
   * Handle PerformDualVetAssessment.
   * @emits DualVetAssessmentCompleted
   */
  performDualVetAssessment(command: PerformDualVetAssessment): DualVetAssessmentCompleted;
  /**
   * Handle RecordClinicalObservation.
   * @emits ClinicalObservationRecorded
   */
  recordClinicalObservation(command: RecordClinicalObservation): ClinicalObservationRecorded;
  /**
   * Handle NormalizeClinicalRecord.
   * @precondition Clinical observation must be recorded
   * @emits ClinicalRecordNormalized
   */
  normalizeClinicalRecord(command: NormalizeClinicalRecord): ClinicalRecordNormalized;
  /**
   * Handle RunClinicalAssessment.
   * @emits ClinicalAssessmentCompleted
   */
  runClinicalAssessment(command: RunClinicalAssessment): ClinicalAssessmentCompleted;
}
