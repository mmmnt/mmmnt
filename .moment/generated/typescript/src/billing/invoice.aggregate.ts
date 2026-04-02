import type { BillingVerified, GenerateInvoice, InvoiceGenerated, LineItem, VerifyBilling } from './invoice.types.js';

/**
 * Aggregate root for Invoice.
 */
export interface InvoiceAggregate {
  readonly invoiceId: string;
  /**
   * Handle GenerateInvoice.
   * @precondition Visit must be marked complete
   * @emits InvoiceGenerated
   */
  generateInvoice(command: GenerateInvoice): InvoiceGenerated;
  /**
   * Handle VerifyBilling.
   * @emits BillingVerified
   */
  verifyBilling(command: VerifyBilling): BillingVerified;
}
