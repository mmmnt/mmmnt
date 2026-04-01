import type {
  BillingVerified,
  GenerateInvoice,
  InvoiceGenerated,
  LineItem,
  VerifyBilling,
} from './invoice.types.js';

/**
 * Aggregate root for Invoice.
 */
export interface InvoiceAggregate {
  readonly invoiceId: string;
  generateInvoice(command: GenerateInvoice): InvoiceGenerated;
  verifyBilling(command: VerifyBilling): BillingVerified;
}
