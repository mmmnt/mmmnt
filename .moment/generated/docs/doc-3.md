# Clinical Inventory

## Aggregates

### VisitRecord

**Commands:**

- CompleteTriage
- PerformDualVetAssessment
- RecordClinicalObservation
- NormalizeClinicalRecord
- RunClinicalAssessment

**Events:**

- TriageCompleted
- DualVetAssessmentCompleted
- ClinicalObservationRecorded
- ClinicalRecordNormalized
- ClinicalAssessmentCompleted

### TreatmentPlan

**Commands:**

- CreateTreatmentPlan
- ConfirmTreatment

**Events:**

- TreatmentPlanCreated
- TreatmentConfirmed

**Value Objects:**

- TriageResults
- VitalSigns
- Medication

## Commands

No context-level commands defined.

## Events

No context-level events defined.

## Value Objects

No context-level value objects defined.
