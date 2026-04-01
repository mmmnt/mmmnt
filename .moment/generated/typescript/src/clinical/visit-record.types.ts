/**
 * Types for the VisitRecord aggregate.
 */

export interface CompleteTriage {
  readonly patientId: string;
  readonly weight: string;
  readonly temperature: string;
  readonly heartRate: string;
  readonly chiefComplaint: string;
}

export interface PerformDualVetAssessment {
  readonly visitId: string;
  readonly triageResults: TriageResults;
}

export interface RecordClinicalObservation {
  readonly visitId: string;
  readonly diagnosis: string;
  readonly differentials: readonly string[];
  readonly confidence: number;
}

export interface NormalizeClinicalRecord {
  readonly visitId: string;
  readonly symptoms: readonly string[];
  readonly vitalSigns: VitalSigns;
}

export interface RunClinicalAssessment {
  readonly visitId: string;
  readonly recordId: string;
  readonly patientId: string;
}

export interface TriageCompleted {
  readonly visitId: string;
  readonly patientId: string;
  readonly weight: string;
  readonly temperature: string;
  readonly heartRate: string;
  readonly chiefComplaint: string;
  readonly urgency: string;
  readonly completedAt: DateTime;
}

export interface DualVetAssessmentCompleted {
  readonly visitId: string;
  readonly agreement: boolean;
  readonly assessedAt: DateTime;
}

export interface ClinicalObservationRecorded {
  readonly visitId: string;
  readonly observationId: string;
  readonly patientId: string;
  readonly diagnosis: string;
  readonly differentials: readonly string[];
  readonly confidence: number;
  readonly recordedAt: DateTime;
}

export interface ClinicalRecordNormalized {
  readonly visitId: string;
  readonly recordId: string;
  readonly patientId: string;
  readonly symptoms: readonly string[];
  readonly vitalSigns: VitalSigns;
  readonly vaccinationStatus: string;
  readonly classification: string;
  readonly normalizedAt: DateTime;
}

export interface ClinicalAssessmentCompleted {
  readonly visitId: string;
  readonly assessmentResult: string;
  readonly completedAt: DateTime;
}
