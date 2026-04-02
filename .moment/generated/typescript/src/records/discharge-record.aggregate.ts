import type { CreateDischargeRecord, DischargeFinalised, DischargeRecordCreated, FinalizeDischarge } from './discharge-record.types.js';

/**
 * Aggregate root for DischargeRecord.
 */
export interface DischargeRecordAggregate {
  readonly dischargeId: string;
  /**
   * Handle CreateDischargeRecord.
   * @emits DischargeRecordCreated
   */
  createDischargeRecord(command: CreateDischargeRecord): DischargeRecordCreated;
  /**
   * Handle FinalizeDischarge.
   * @precondition Billing must be verified before discharge
   * @emits DischargeFinalised
   */
  finalizeDischarge(command: FinalizeDischarge): DischargeFinalised;
}
