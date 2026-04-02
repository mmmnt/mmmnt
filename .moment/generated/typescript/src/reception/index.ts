export * from './patient-intake.types.js';
export * from './patient-intake.aggregate.js';

import type { PatientCheckedIn, IntakeValidated, PatientIntakeRegistered } from './patient-intake.types.js';

export type ReceptionEvent = IntakeValidated | PatientCheckedIn | PatientIntakeRegistered;

