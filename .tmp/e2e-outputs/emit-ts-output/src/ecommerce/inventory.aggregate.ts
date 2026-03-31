import type {
  ReleaseStock,
  ReserveStock,
  StockReleased,
  StockReserved,
} from './inventory.types.js';

/**
 * Aggregate root for Inventory.
 */
export interface InventoryAggregate {
  readonly warehouseId: string;
  reserveStock(command: ReserveStock): StockReserved;
  releaseStock(command: ReleaseStock): StockReleased;
}
