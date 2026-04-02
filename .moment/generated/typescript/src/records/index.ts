export * from './discharge-record.types.js';
export * from './discharge-record.aggregate.js';

import type { DischargeRecordCreated, DischargeFinalised } from './discharge-record.types.js';

export type RecordsEvent = DischargeFinalised | DischargeRecordCreated;

