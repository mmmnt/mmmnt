/**
 * Types for the DischargeRecord aggregate.
 */

export interface CreateDischargeRecord {
  readonly visitId: string;
  readonly patientId: string;
  readonly planId: string;
  readonly invoiceId: string;
}

export interface FinalizeDischarge {
  readonly dischargeId: string;
}

export interface DischargeRecordCreated {
  readonly dischargeId: string;
  readonly visitId: string;
  readonly patientId: string;
  readonly createdAt: DateTime;
}

export interface DischargeFinalised {
  readonly dischargeId: string;
  readonly finalisedAt: DateTime;
}
