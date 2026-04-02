export * from './patient-intake.types.js';
export * from './patient-intake.aggregate.js';

export type ReceptionEvent = IntakeValidated | PatientCheckedIn | PatientIntakeRegistered;

