/**
 * Types for the Inventory aggregate.
 */

export interface ReserveStock {
  readonly orderId: string;
  readonly items: readonly OrderItem[];
}

export interface ReleaseStock {
  readonly orderId: string;
  readonly items: readonly OrderItem[];
}

export interface StockReserved {
  readonly warehouseId: string;
  readonly orderId: string;
  readonly items: readonly OrderItem[];
  readonly reservedAt: DateTime;
}

export interface StockReleased {
  readonly warehouseId: string;
  readonly orderId: string;
  readonly items: readonly OrderItem[];
  readonly releasedAt: DateTime;
}
