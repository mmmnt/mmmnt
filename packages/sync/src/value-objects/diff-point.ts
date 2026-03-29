import type { DifferenceType } from './difference-type.js';

export interface DiffPoint {
  readonly filePath: string;
  readonly differenceType: DifferenceType;
  readonly symbolName: string;
}
