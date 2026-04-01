# ECommerce Inventory

## Aggregates

### Order

**Commands:**

- PlaceOrder
- CancelOrder
- ConfirmPayment

**Events:**

- OrderPlaced
- OrderCancelled
- PaymentConfirmed

### Inventory

**Commands:**

- ReserveStock
- ReleaseStock

**Events:**

- StockReserved
- StockReleased

### Shipment

**Commands:**

- CreateShipment
- DispatchShipment

**Events:**

- ShipmentCreated
- ShipmentDispatched

**Value Objects:**

- OrderItem
- Address

## Commands

No context-level commands defined.

## Events

No context-level events defined.

## Value Objects

No context-level value objects defined.
