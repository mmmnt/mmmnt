export type CascadeCategory = 1 | 2 | 3;

export interface CascadeClassification {
  readonly category: CascadeCategory;
  readonly description: string;
  readonly requiredActions: readonly string[];
}
