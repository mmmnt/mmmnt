import type { CascadeCategory } from './cascade-classification.js';

export interface ReconciliationResult {
  readonly filesUpdated: readonly string[];
  readonly conflictsResolved: number;
  readonly cascadeCategory: CascadeCategory;
}
