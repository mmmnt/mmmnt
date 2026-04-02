@context:Reception @classification:Core @context:Clinical @classification:Core @context:Billing @classification:Supporting @context:Records @classification:Supporting
Feature: scheduled-visit-happy-path
  Pet owner arrives for a scheduled appointment. Full lifecycle through check-in, triage, diagnosis, treatment, billing, and discharge.

  Rule: Reception [Core]

    @aggregate:PatientIntake @invariant:REC-01 @invariant:REC-02
    Scenario: Patient check-in
      Given Patient must have a scheduled appointment
      When Reception performs CheckInPatient with patientId, ownerName, appointmentType
      Then Reception emits PatientCheckedIn
        carrying intakeId, patientId, ownerName, appointmentType, checkedInAt

    @aggregate:PatientIntake @invariant:REC-01 @invariant:REC-02
    Scenario: Intake validation
      Given Intake form must be fully completed
      And PatientCheckedIn has occurred
      When Reception performs SubmitValidateIntake with intakeFormId, patientId
      Then Reception emits IntakeValidated
        carrying intakeId, patientId, validationResult, validatedAt

    @aggregate:PatientIntake @crossing @saga:VisitLifecycle @invariant:REC-01 @invariant:REC-02 @happy-path
    Scenario: Intake validation outcome [valid]
      And IntakeValidated has occurred
      When Reception performs RegisterPatientIntake with validatedIntakeId, patientId
      Then PatientIntakeRegistered crosses to Clinical via CustomerSupplier
        | patientId | name | species | ownerName | appointmentType |
        | UUID | string | string | string | string |

    @terminal @failure-path
    Scenario: Intake validation outcome [invalid]
      Given the intake validation outcome is evaluated
      When the outcome is invalid
      Then the flow terminates

  Rule: Clinical [Core]

    @aggregate:VisitRecord @policy:TriageOnIntakeRegistered @invariant:CLN-01 @invariant:CLN-02
    Scenario: Triage
      Given Patient must be registered through intake
      And PatientIntakeRegistered has occurred
      When Clinical performs CompleteTriage with patientId, weight, temperature, heartRate, chiefComplaint
      Then Clinical emits TriageCompleted
        carrying visitId, patientId, weight, temperature, heartRate, chiefComplaint, urgency, completedAt

    @aggregate:VisitRecord @policy:AssessOnTriageCompleted @invariant:CLN-01 @invariant:CLN-02
    Scenario: Dual-vet assessment
      And TriageCompleted has occurred
      When Clinical performs PerformDualVetAssessment with visitId, triageResults
      Then Clinical emits DualVetAssessmentCompleted
        carrying visitId, agreement, assessedAt

    @aggregate:VisitRecord @invariant:CLN-01 @invariant:CLN-02 @happy-path
    Scenario: Assessment agreement [agree]
      And DualVetAssessmentCompleted has occurred
      When Clinical performs RecordClinicalObservation with visitId, diagnosis, differentials, confidence
      Then Clinical emits ClinicalObservationRecorded
        carrying visitId, observationId, patientId, diagnosis, differentials, confidence, recordedAt

    @terminal @failure-path
    Scenario: Assessment agreement [disagree]
      Given the assessment agreement is evaluated
      When the outcome is disagree
      Then the flow terminates

    @aggregate:VisitRecord @policy:NormalizeOnObservation @invariant:CLN-01 @invariant:CLN-02
    Scenario: Clinical record normalization
      Given Clinical observation must be recorded
      And ClinicalObservationRecorded has occurred
      When Clinical performs NormalizeClinicalRecord with visitId, symptoms, vitalSigns
      Then Clinical emits ClinicalRecordNormalized
        carrying visitId, recordId, patientId, symptoms, vitalSigns, vaccinationStatus, classification, normalizedAt

    @aggregate:VisitRecord @invariant:CLN-01 @invariant:CLN-02 @happy-path
    Scenario: Records completeness check [complete]
      And ClinicalRecordNormalized has occurred
      When Clinical performs RunClinicalAssessment with visitId, recordId, patientId
      Then Clinical emits ClinicalAssessmentCompleted
        carrying visitId, assessmentResult, completedAt

    @terminal @failure-path
    Scenario: Records completeness check [incomplete]
      Given the records completeness check is evaluated
      When the outcome is incomplete
      Then the flow terminates

    @aggregate:TreatmentPlan @policy:TreatOnAssessment @invariant:CLN-03
    Scenario: Treatment planning
      Given Clinical assessment must be completed
      And ClinicalAssessmentCompleted has occurred
      When Clinical performs CreateTreatmentPlan with visitId, patientId, diagnosis, medications
      Then Clinical emits TreatmentPlanCreated
        carrying planId, visitId, patientId, diagnosis, medications, instructions, createdAt

    @aggregate:TreatmentPlan @crossing @invariant:CLN-03
    Scenario: Treatment confirmation
      Given Treatment plan must exist
      And TreatmentPlanCreated has occurred
      When Clinical performs ConfirmTreatment with planId, confirmedBy, rationale
      Then TreatmentConfirmed crosses to Billing via CustomerSupplier
        | planId | visitId | patientId |
        | UUID | UUID | UUID |

    @saga:VisitLifecycle
    Scenario: VisitLifecycle state transitions
      Given the saga is triggered by PatientIntakeRegistered
      Then states progress: Triaging → Diagnosing → Cataloging → Treating → Complete

    @saga:VisitLifecycle @compensation
    Scenario: VisitLifecycle compensation
      When visitTimeout is exceeded
      Then Cancel visit and release appointment slot is executed

  Rule: Billing [Supporting]

    @aggregate:Invoice @policy:BillOnVisitComplete @invariant:BIL-01
    Scenario: Invoice generation
      Given Visit must be marked complete
      And TreatmentConfirmed has occurred
      When Billing performs GenerateInvoice with visitId, patientId, lineItems
      Then Billing emits InvoiceGenerated
        carrying invoiceId, visitId, patientId, lineItems, total, currency, generatedAt

    @aggregate:Invoice @crossing @invariant:BIL-01
    Scenario: Billing verification
      And InvoiceGenerated has occurred
      When Billing performs VerifyBilling with invoiceId
      Then BillingVerified crosses to Records via CustomerSupplier
        | invoiceId | visitId | patientId |
        | UUID | UUID | UUID |

  Rule: Records [Supporting]

    @aggregate:DischargeRecord @policy:DischargeOnBilling @invariant:REC-03
    Scenario: Discharge record creation
      And BillingVerified has occurred
      When Records performs CreateDischargeRecord with visitId, patientId, planId, invoiceId
      Then Records emits DischargeRecordCreated
        carrying dischargeId, visitId, patientId, createdAt

    @aggregate:DischargeRecord @invariant:REC-03
    Scenario: Discharge finalization
      Given Billing must be verified before discharge
      And DischargeRecordCreated has occurred
      When Records performs FinalizeDischarge with dischargeId
      Then Records emits DischargeFinalised
        carrying dischargeId, finalisedAt
