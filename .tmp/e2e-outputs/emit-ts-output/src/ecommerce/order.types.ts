/**
 * Types for the Order aggregate.
 */

export interface PlaceOrder {
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: Address;
}

export interface CancelOrder {
  readonly orderId: string;
  readonly reason: string;
}

export interface ConfirmPayment {
  readonly orderId: string;
  readonly paymentId: string;
  readonly amount: Money;
}

export interface OrderPlaced {
  readonly orderId: string;
  readonly customerId: string;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: Address;
  readonly placedAt: DateTime;
}

export interface OrderCancelled {
  readonly orderId: string;
  readonly reason: string;
  readonly cancelledAt: DateTime;
}

export interface PaymentConfirmed {
  readonly orderId: string;
  readonly paymentId: string;
  readonly amount: Money;
  readonly confirmedAt: DateTime;
}
