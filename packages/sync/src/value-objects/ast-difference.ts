import type { DifferenceType } from './difference-type.js';

export interface ASTDifference {
  readonly filePath: string;
  readonly differenceType: DifferenceType;
  readonly expectedNode: string;
  readonly actualNode: string;
}
