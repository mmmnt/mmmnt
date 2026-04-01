Feature: scheduled-visit-happy-path
  Pet owner arrives for a scheduled appointment. Full lifecycle through check-in, triage, diagnosis, treatment, billing, and discharge.

  Scenario: Patient check-in
    Given Patient must have a scheduled appointment
    When Reception performs CheckInPatient with patientId, ownerName, appointmentType
    Then Reception emits PatientCheckedIn
      carrying intakeId, patientId, ownerName, appointmentType, checkedInAt

  Scenario: Intake validation
    Given Intake form must be fully completed
    Given PatientCheckedIn has occurred
    When Reception performs SubmitValidateIntake with intakeFormId, patientId
    Then Reception emits IntakeValidated
      carrying intakeId, patientId, validationResult, validatedAt

  Scenario: Intake validation outcome [valid]
    Given IntakeValidated has occurred
    When Reception performs RegisterPatientIntake with validatedIntakeId, patientId
    Then PatientIntakeRegistered crosses to Clinical via CustomerSupplier
      | patientId | name | species | ownerName | appointmentType |
      | UUID | string | string | string | string |

  Scenario: Intake validation outcome [invalid]
    Then Intake Failure emits IntakeValidated (terminal)

  Scenario: Triage
    Given Patient must be registered through intake
    Given PatientIntakeRegistered has occurred
    When Clinical performs CompleteTriage with patientId, weight, temperature, heartRate, chiefComplaint
    Then Clinical emits TriageCompleted
      carrying visitId, patientId, weight, temperature, heartRate, chiefComplaint, urgency, completedAt

  Scenario: Dual-vet assessment
    Given TriageCompleted has occurred
    When Clinical performs PerformDualVetAssessment with visitId, triageResults
    Then Clinical emits DualVetAssessmentCompleted
      carrying visitId, agreement, assessedAt

  Scenario: Assessment agreement [agree]
    Given DualVetAssessmentCompleted has occurred
    When Clinical performs RecordClinicalObservation with visitId, diagnosis, differentials, confidence
    Then Clinical emits ClinicalObservationRecorded
      carrying visitId, observationId, patientId, diagnosis, differentials, confidence, recordedAt

  Scenario: Assessment agreement [disagree]
    Then Vet Disagreement emits DualVetAssessmentCompleted (terminal)

  Scenario: Clinical record normalization
    Given Clinical observation must be recorded
    Given ClinicalObservationRecorded has occurred
    When Clinical performs NormalizeClinicalRecord with visitId, symptoms, vitalSigns
    Then Clinical emits ClinicalRecordNormalized
      carrying visitId, recordId, patientId, symptoms, vitalSigns, vaccinationStatus, classification, normalizedAt

  Scenario: Records completeness check [complete]
    Given ClinicalRecordNormalized has occurred
    When Clinical performs RunClinicalAssessment with visitId, recordId, patientId
    Then Clinical emits ClinicalAssessmentCompleted
      carrying visitId, assessmentResult, completedAt

  Scenario: Records completeness check [incomplete]
    Then Records Incomplete emits ClinicalRecordNormalized (terminal)

  Scenario: Treatment planning
    Given Clinical assessment must be completed
    Given ClinicalAssessmentCompleted has occurred
    When Clinical performs CreateTreatmentPlan with visitId, patientId, diagnosis, medications
    Then Clinical emits TreatmentPlanCreated
      carrying planId, visitId, patientId, diagnosis, medications, instructions, createdAt

  Scenario: Treatment confirmation
    Given Treatment plan must exist
    Given TreatmentPlanCreated has occurred
    When Clinical performs ConfirmTreatment with planId, confirmedBy, rationale
    Then TreatmentConfirmed crosses to Billing via CustomerSupplier
      | planId | visitId | patientId |
      | UUID | UUID | UUID |

  Scenario: Invoice generation
    Given Visit must be marked complete
    Given TreatmentConfirmed has occurred
    When Billing performs GenerateInvoice with visitId, patientId, lineItems
    Then Billing emits InvoiceGenerated
      carrying invoiceId, visitId, patientId, lineItems, total, currency, generatedAt

  Scenario: Billing verification
    Given InvoiceGenerated has occurred
    When Billing performs VerifyBilling with invoiceId
    Then BillingVerified crosses to Records via CustomerSupplier
      | invoiceId | visitId | patientId |
      | UUID | UUID | UUID |

  Scenario: Discharge record creation
    Given BillingVerified has occurred
    When Records performs CreateDischargeRecord with visitId, patientId, planId, invoiceId
    Then Records emits DischargeRecordCreated
      carrying dischargeId, visitId, patientId, createdAt

  Scenario: Discharge finalization
    Given Billing must be verified before discharge
    Given DischargeRecordCreated has occurred
    When Records performs FinalizeDischarge with dischargeId
    Then Records emits DischargeFinalised
      carrying dischargeId, finalisedAt
