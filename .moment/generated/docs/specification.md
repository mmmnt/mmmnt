# Domain Specification

This document describes the domain model, business rules, and behavioral flows defined in the Moment specification. It is generated from the `.moment` source files and reflects the current state of the domain design.

---

## Executive Summary

This domain is organized into **4 bounded contexts**, containing **5 aggregates** that handle **14 commands** and produce **14 events**.

**1 behavioral flow** describe how these contexts interact across **14 moments** in time.

| | Count |
|---|---:|
| Bounded Contexts | 4 |
| Aggregates | 5 |
| Commands | 14 |
| Events | 14 |
| Value Objects | 5 |
| Business Rules | 7 |
| Policies | 6 |
| Behavioral Flows | 1 |

## Domain Model

### Reception — Core

*1 aggregate, 3 commands, 3 events*

#### PatientIntake

Identified by `intakeId` (UUID)

| Operation | What It Does | Produces |
|-----------|-------------|----------|
| **CheckInPatient** | Accepts: patientId, ownerName, appointmentType | PatientCheckedIn |
| **SubmitValidateIntake** | Accepts: intakeFormId, patientId | IntakeValidated |
| **RegisterPatientIntake** | Accepts: validatedIntakeId, patientId | PatientIntakeRegistered |

**PatientCheckedIn** carries:

- intakeId — *UUID*
- patientId — *UUID*
- ownerName — *string*
- appointmentType — *string*
- checkedInAt — *DateTime*

**IntakeValidated** carries:

- intakeId — *UUID*
- patientId — *UUID*
- validationResult — *string*
- validatedAt — *DateTime*

**PatientIntakeRegistered** carries:

- intakeId — *UUID*
- patientId — *UUID*
- name — *string*
- species — *string*
- breed — *string*
- ownerName — *string*
- appointmentType — *string*
- registeredAt — *DateTime*

**Data structures:**

- **AppointmentDetails**: appointmentId, scheduledAt, appointmentType, veterinarianId

### Clinical — Core

*2 aggregates, 7 commands, 7 events*

#### VisitRecord

Identified by `visitId` (UUID)

| Operation | What It Does | Produces |
|-----------|-------------|----------|
| **CompleteTriage** | Accepts: patientId, weight, temperature, heartRate, chiefComplaint | TriageCompleted |
| **PerformDualVetAssessment** | Accepts: visitId, triageResults | DualVetAssessmentCompleted |
| **RecordClinicalObservation** | Accepts: visitId, diagnosis, differentials, confidence | ClinicalObservationRecorded |
| **NormalizeClinicalRecord** | Accepts: visitId, symptoms, vitalSigns | ClinicalRecordNormalized |
| **RunClinicalAssessment** | Accepts: visitId, recordId, patientId | ClinicalAssessmentCompleted |

**TriageCompleted** carries:

- visitId — *UUID*
- patientId — *UUID*
- weight — *string*
- temperature — *string*
- heartRate — *string*
- chiefComplaint — *string*
- urgency — *string*
- completedAt — *DateTime*

**DualVetAssessmentCompleted** carries:

- visitId — *UUID*
- agreement — *boolean*
- assessedAt — *DateTime*

**ClinicalObservationRecorded** carries:

- visitId — *UUID*
- observationId — *UUID*
- patientId — *UUID*
- diagnosis — *string*
- differentials — *string (list)*
- confidence — *number*
- recordedAt — *DateTime*

**ClinicalRecordNormalized** carries:

- visitId — *UUID*
- recordId — *UUID*
- patientId — *UUID*
- symptoms — *string (list)*
- vitalSigns — *VitalSigns*
- vaccinationStatus — *string*
- classification — *string*
- normalizedAt — *DateTime*

**ClinicalAssessmentCompleted** carries:

- visitId — *UUID*
- assessmentResult — *string*
- completedAt — *DateTime*

#### TreatmentPlan

Identified by `planId` (UUID)

| Operation | What It Does | Produces |
|-----------|-------------|----------|
| **CreateTreatmentPlan** | Accepts: visitId, patientId, diagnosis, medications | TreatmentPlanCreated |
| **ConfirmTreatment** | Accepts: planId, confirmedBy, rationale | TreatmentConfirmed |

**TreatmentPlanCreated** carries:

- planId — *UUID*
- visitId — *UUID*
- patientId — *UUID*
- diagnosis — *string*
- medications — *Medication (list)*
- instructions — *string*
- createdAt — *DateTime*

**TreatmentConfirmed** carries:

- planId — *UUID*
- confirmedBy — *string*
- rationale — *string*
- confirmedAt — *DateTime*

**Data structures:**

- **TriageResults**: weight, temperature, heartRate, chiefComplaint, urgency
- **VitalSigns**: weight, temperature, heartRate
- **Medication**: name, dose, frequency

### Billing — Supporting

*1 aggregate, 2 commands, 2 events*

#### Invoice

Identified by `invoiceId` (UUID)

| Operation | What It Does | Produces |
|-----------|-------------|----------|
| **GenerateInvoice** | Accepts: visitId, patientId, lineItems | InvoiceGenerated |
| **VerifyBilling** | Accepts: invoiceId | BillingVerified |

**InvoiceGenerated** carries:

- invoiceId — *UUID*
- visitId — *UUID*
- patientId — *UUID*
- lineItems — *LineItem (list)*
- total — *Money*
- currency — *string*
- generatedAt — *DateTime*

**BillingVerified** carries:

- invoiceId — *UUID*
- verifiedAt — *DateTime*

**Data structures:**

- **LineItem**: label, amount

### Records — Supporting

*1 aggregate, 2 commands, 2 events*

#### DischargeRecord

Identified by `dischargeId` (UUID)

| Operation | What It Does | Produces |
|-----------|-------------|----------|
| **CreateDischargeRecord** | Accepts: visitId, patientId, planId, invoiceId | DischargeRecordCreated |
| **FinalizeDischarge** | Accepts: dischargeId | DischargeFinalised |

**DischargeRecordCreated** carries:

- dischargeId — *UUID*
- visitId — *UUID*
- patientId — *UUID*
- createdAt — *DateTime*

**DischargeFinalised** carries:

- dischargeId — *UUID*
- finalisedAt — *DateTime*

## How Contexts Communicate

Context boundaries are crossed at these points:

| Event | From | To | Relationship | Required Fields |
|-------|------|----|-------------|-----------------|
| PatientIntakeRegistered | Reception | Clinical | CustomerSupplier | patientId, name, species, ownerName, appointmentType |
| TreatmentConfirmed | Clinical | Billing | CustomerSupplier | planId, visitId, patientId |
| BillingVerified | Billing | Records | CustomerSupplier | invoiceId, visitId, patientId |

## Behavioral Flows

Flows describe what happens over time — the sequence of operations and events that move through the domain. Each **moment** is a point in time where something significant occurs.

### scheduled-visit-happy-path

> Pet owner arrives for a scheduled appointment. Full lifecycle through check-in, triage, diagnosis, treatment, billing, and discharge.

This flow progresses through **14 moments** with **3 decision points**.

**Step 1: Patient check-in**

- Reception performs **CheckInPatient**
- Reception performs **PatientCheckedIn**

**Step 2: Intake validation**

- Reception performs **SubmitValidateIntake**
- Reception performs **IntakeValidated**

**Step 3: Intake validation outcome *(decision point)***

- *If valid:*
  - Reception: **RegisterPatientIntake**
  - Reception: **PatientIntakeRegistered**
- *If invalid:*
  - Intake Failure: **IntakeValidated** *(flow ends)*
- → *Crosses to **Clinical***

**Step 4: Triage**

- Clinical performs **CompleteTriage**
- Clinical performs **TriageCompleted**

**Step 5: Dual-vet assessment**

- Clinical performs **PerformDualVetAssessment**
- Clinical performs **DualVetAssessmentCompleted**

**Step 6: Assessment agreement *(decision point)***

- *If agree:*
  - Clinical: **RecordClinicalObservation**
  - Clinical: **ClinicalObservationRecorded**
- *If disagree:*
  - Vet Disagreement: **DualVetAssessmentCompleted** *(flow ends)*

**Step 7: Clinical record normalization**

- Clinical performs **NormalizeClinicalRecord**
- Clinical performs **ClinicalRecordNormalized**

**Step 8: Records completeness check *(decision point)***

- *If complete:*
  - Clinical: **RunClinicalAssessment**
  - Clinical: **ClinicalAssessmentCompleted**
- *If incomplete:*
  - Records Incomplete: **ClinicalRecordNormalized** *(flow ends)*

**Step 9: Treatment planning**

- Clinical performs **CreateTreatmentPlan**
- Clinical performs **TreatmentPlanCreated**

**Step 10: Treatment confirmation**

- Clinical performs **ConfirmTreatment**
- Clinical performs **TreatmentConfirmed**
- → *Crosses to **Billing***

**Step 11: Invoice generation**

- Billing performs **GenerateInvoice**
- Billing performs **InvoiceGenerated**

**Step 12: Billing verification**

- Billing performs **VerifyBilling**
- Billing performs **BillingVerified**
- → *Crosses to **Records***

**Step 13: Discharge record creation**

- Records performs **CreateDischargeRecord**
- Records performs **DischargeRecordCreated**

**Step 14: Discharge finalization**

- Records performs **FinalizeDischarge**
- Records performs **DischargeFinalised**

## Business Rules

These rules must hold true at all times:

| Rule | Description | Applies To |
|------|-------------|------------|
| REC-01 | Patient must have valid identification | Reception / PatientIntake |
| REC-02 | Intake form must pass completeness validation | Reception / PatientIntake |
| CLN-01 | Triage must be completed before diagnosis | Clinical / VisitRecord |
| CLN-02 | Dual-vet assessment must agree before proceeding | Clinical / VisitRecord |
| CLN-03 | Treatment plan requires confirmed diagnosis | Clinical / TreatmentPlan |
| BIL-01 | Invoice total must match sum of line items | Billing / Invoice |
| REC-03 | Discharge requires verified billing | Records / DischargeRecord |

---

*This specification was generated by [Moment](https://github.com/mmmnt/mmmnt) from 4 bounded contexts and 1 behavioral flow.*
