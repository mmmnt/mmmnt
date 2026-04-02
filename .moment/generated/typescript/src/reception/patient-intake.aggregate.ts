import type { AppointmentDetails, CheckInPatient, IntakeValidated, PatientCheckedIn, PatientIntakeRegistered, RegisterPatientIntake, SubmitValidateIntake } from './patient-intake.types.js';

/**
 * Aggregate root for PatientIntake.
 */
export interface PatientIntakeAggregate {
  readonly intakeId: string;
  /**
   * Handle CheckInPatient.
   * @precondition Patient must have a scheduled appointment
   * @emits PatientCheckedIn
   */
  checkInPatient(command: CheckInPatient): PatientCheckedIn;
  /**
   * Handle SubmitValidateIntake.
   * @precondition Intake form must be fully completed
   * @emits IntakeValidated
   */
  submitValidateIntake(command: SubmitValidateIntake): IntakeValidated;
  /**
   * Handle RegisterPatientIntake.
   * @emits PatientIntakeRegistered
   */
  registerPatientIntake(command: RegisterPatientIntake): PatientIntakeRegistered;
}
