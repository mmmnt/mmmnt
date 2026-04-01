import type {
  AppointmentDetails,
  CheckInPatient,
  IntakeValidated,
  PatientCheckedIn,
  PatientIntakeRegistered,
  RegisterPatientIntake,
  SubmitValidateIntake,
} from './patient-intake.types.js';

/**
 * Aggregate root for PatientIntake.
 */
export interface PatientIntakeAggregate {
  readonly intakeId: string;
  checkInPatient(command: CheckInPatient): PatientCheckedIn;
  submitValidateIntake(command: SubmitValidateIntake): IntakeValidated;
  registerPatientIntake(command: RegisterPatientIntake): PatientIntakeRegistered;
}
