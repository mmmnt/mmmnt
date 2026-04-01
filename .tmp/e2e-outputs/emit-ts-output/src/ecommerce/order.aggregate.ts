import type {
  CancelOrder,
  ConfirmPayment,
  OrderCancelled,
  OrderPlaced,
  PaymentConfirmed,
  PlaceOrder,
} from './order.types.js';

/**
 * Aggregate root for Order.
 */
export interface OrderAggregate {
  readonly orderId: string;
  placeOrder(command: PlaceOrder): OrderPlaced;
  cancelOrder(command: CancelOrder): OrderCancelled;
  confirmPayment(command: ConfirmPayment): PaymentConfirmed;
}
