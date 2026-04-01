/**
 * Types for the FulfillmentRequest aggregate.
 */

export interface OrderItem {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface InitiateFulfillment {
  readonly orderId: string;
  readonly items: readonly OrderItem[];
}

export interface FulfillmentInitiated {
  readonly fulfillmentId: string;
  readonly orderId: string;
  readonly items: readonly OrderItem[];
  readonly initiatedAt: DateTime;
}
