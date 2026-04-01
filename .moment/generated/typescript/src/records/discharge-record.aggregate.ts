import type {
  CreateDischargeRecord,
  DischargeFinalised,
  DischargeRecordCreated,
  FinalizeDischarge,
} from './discharge-record.types.js';

/**
 * Aggregate root for DischargeRecord.
 */
export interface DischargeRecordAggregate {
  readonly dischargeId: string;
  createDischargeRecord(command: CreateDischargeRecord): DischargeRecordCreated;
  finalizeDischarge(command: FinalizeDischarge): DischargeFinalised;
}
