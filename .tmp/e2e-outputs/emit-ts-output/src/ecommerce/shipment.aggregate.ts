import type {
  Address,
  CreateShipment,
  DispatchShipment,
  OrderItem,
  ShipmentCreated,
  ShipmentDispatched,
} from './shipment.types.js';

/**
 * Aggregate root for Shipment.
 */
export interface ShipmentAggregate {
  readonly shipmentId: string;
  createShipment(command: CreateShipment): ShipmentCreated;
  dispatchShipment(command: DispatchShipment): ShipmentDispatched;
}
