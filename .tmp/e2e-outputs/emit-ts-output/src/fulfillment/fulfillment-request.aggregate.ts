import type {
  FulfillmentInitiated,
  InitiateFulfillment,
  OrderItem,
} from './fulfillment-request.types.js';

/**
 * Aggregate root for FulfillmentRequest.
 */
export interface FulfillmentRequestAggregate {
  readonly fulfillmentId: string;
  initiateFulfillment(command: InitiateFulfillment): FulfillmentInitiated;
}
