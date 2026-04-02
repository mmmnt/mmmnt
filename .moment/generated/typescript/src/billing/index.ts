export * from './invoice.types.js';
export * from './invoice.aggregate.js';

import type { InvoiceGenerated, BillingVerified } from './invoice.types.js';

export type BillingEvent = BillingVerified | InvoiceGenerated;

