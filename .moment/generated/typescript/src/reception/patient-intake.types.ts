/**
 * Types for the PatientIntake aggregate.
 */

export interface AppointmentDetails {
  readonly appointmentId: string;
  readonly scheduledAt: DateTime;
  readonly appointmentType: string;
  readonly veterinarianId: string;
}

export interface CheckInPatient {
  readonly patientId: string;
  readonly ownerName: string;
  readonly appointmentType: string;
}

export interface SubmitValidateIntake {
  readonly intakeFormId: string;
  readonly patientId: string;
}

export interface RegisterPatientIntake {
  readonly validatedIntakeId: string;
  readonly patientId: string;
}

export interface PatientCheckedIn {
  readonly intakeId: string;
  readonly patientId: string;
  readonly ownerName: string;
  readonly appointmentType: string;
  readonly checkedInAt: DateTime;
}

export interface IntakeValidated {
  readonly intakeId: string;
  readonly patientId: string;
  readonly validationResult: string;
  readonly validatedAt: DateTime;
}

export interface PatientIntakeRegistered {
  readonly intakeId: string;
  readonly patientId: string;
  readonly name: string;
  readonly species: string;
  readonly breed: string;
  readonly ownerName: string;
  readonly appointmentType: string;
  readonly registeredAt: DateTime;
}
