Feature: scheduled-visit-happy-path

  Scenario: Patient check-in

  Scenario: Intake validation

  Scenario: Intake validation outcome [valid]
    When PatientIntakeRegistered crosses from ctx-Reception to ctx-Clinical
    Then PatientIntakeRegistered payload is valid
      | patientId | name | species | ownerName | appointmentType |
      | UUID | string | string | string | string |
      | required | required | required | required | required |

  Scenario: Intake validation outcome [invalid]
    When PatientIntakeRegistered crosses from ctx-Reception to ctx-Clinical
    Then PatientIntakeRegistered payload is valid
      | patientId | name | species | ownerName | appointmentType |
      | UUID | string | string | string | string |
      | required | required | required | required | required |

  Scenario: Triage

  Scenario: Dual-vet assessment

  Scenario: Assessment agreement [agree]

  Scenario: Assessment agreement [disagree]

  Scenario: Clinical record normalization

  Scenario: Records completeness check [complete]

  Scenario: Records completeness check [incomplete]

  Scenario: Treatment planning

  Scenario: Treatment confirmation
    When TreatmentConfirmed crosses from ctx-Clinical to ctx-Billing
    Then TreatmentConfirmed payload is valid
      | planId | visitId | patientId |
      | UUID | UUID | UUID |
      | required | required | required |

  Scenario: Invoice generation

  Scenario: Billing verification
    When BillingVerified crosses from ctx-Billing to ctx-Records
    Then BillingVerified payload is valid
      | invoiceId | visitId | patientId |
      | UUID | UUID | UUID |
      | required | required | required |

  Scenario: Discharge record creation

  Scenario: Discharge finalization
