import type {
  CancelOrder,
  OrderCancelled,
  OrderItem,
  OrderPlaced,
  PlaceOrder,
} from './order.types.js';

/**
 * Aggregate root for Order.
 */
export interface OrderAggregate {
  readonly orderId: string;
  placeOrder(command: PlaceOrder): OrderPlaced;
  cancelOrder(command: CancelOrder): OrderCancelled;
}
