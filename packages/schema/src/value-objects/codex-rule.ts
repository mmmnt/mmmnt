export type RuleSeverity = 'error' | 'warning';

export interface CodexRule {
  readonly ruleId: string;
  readonly ruleType: string;
  readonly parameters: Readonly<Record<string, unknown>>;
  readonly severity: RuleSeverity;
}
