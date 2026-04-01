Feature: order-placed

  Scenario: Order submission
    When OrderPlaced crosses from ctx-Ordering to ctx-Fulfillment
    Then OrderPlaced payload is valid
      | orderId | items |
      | UUID | OrderItem[] |
      | required | required |

  Scenario: Fulfillment initiation
