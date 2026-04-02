/**
 * Types for the Invoice aggregate.
 */

export interface LineItem {
  readonly label: string;
  readonly amount: Money;
}

export interface GenerateInvoice {
  readonly visitId: string;
  readonly patientId: string;
  readonly lineItems: readonly LineItem[];
}

export interface VerifyBilling {
  readonly invoiceId: string;
}

export interface InvoiceGenerated {
  readonly invoiceId: string;
  readonly visitId: string;
  readonly patientId: string;
  readonly lineItems: readonly LineItem[];
  readonly total: Money;
  readonly currency: string;
  readonly generatedAt: DateTime;
}

export interface BillingVerified {
  readonly invoiceId: string;
  readonly verifiedAt: DateTime;
}
