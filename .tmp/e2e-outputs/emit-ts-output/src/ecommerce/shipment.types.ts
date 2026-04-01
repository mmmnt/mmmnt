/**
 * Types for the Shipment aggregate.
 */

export interface OrderItem {
  readonly productId: string;
  readonly quantity: number;
  readonly unitPrice: Money;
}

export interface Address {
  readonly street: string;
  readonly city: string;
  readonly state: string;
  readonly postalCode: string;
  readonly country: string;
}

export interface CreateShipment {
  readonly orderId: string;
  readonly items: readonly OrderItem[];
  readonly shippingAddress: Address;
}

export interface DispatchShipment {
  readonly shipmentId: string;
  readonly carrier: string;
  readonly trackingNumber: string;
}

export interface ShipmentCreated {
  readonly shipmentId: string;
  readonly orderId: string;
  readonly shippingAddress: Address;
  readonly createdAt: DateTime;
}

export interface ShipmentDispatched {
  readonly shipmentId: string;
  readonly carrier: string;
  readonly trackingNumber: string;
  readonly dispatchedAt: DateTime;
}
