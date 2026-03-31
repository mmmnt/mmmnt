Feature: order-to-shipment

  Scenario: Order placement
    When OrderPlaced crosses from ctx-Ordering to ctx-Fulfillment
    Then OrderPlaced payload is valid
      | orderId | items | shippingAddress |
      | UUID | OrderItem[] | Address |
      | required | required | required |

  Scenario: Inventory check

  Scenario: Inventory check outcome [available]
    When FulfillmentReady crosses from ctx-Fulfillment to ctx-Shipping
    Then FulfillmentReady payload is valid
      | orderId | reservedItems |
      | UUID | ReservedItem[] |
      | required | required |

  Scenario: Inventory check outcome [unavailable]
    When FulfillmentReady crosses from ctx-Fulfillment to ctx-Shipping
    Then FulfillmentReady payload is valid
      | orderId | reservedItems |
      | UUID | ReservedItem[] |
      | required | required |

  Scenario: Shipment creation

  Scenario: Dispatch
