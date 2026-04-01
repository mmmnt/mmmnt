/**
 * Types for the Order aggregate.
 */

export interface OrderItem {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface PlaceOrder {
  readonly customerId: string;
  readonly items: readonly OrderItem[];
}

export interface CancelOrder {
  readonly orderId: string;
  readonly reason: string;
}

export interface OrderPlaced {
  readonly orderId: string;
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly placedAt: DateTime;
}

export interface OrderCancelled {
  readonly orderId: string;
  readonly reason: string;
  readonly cancelledAt: DateTime;
}
