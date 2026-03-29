export type RulePackSource = 'cdn' | 'kafka';

export interface RulePackVersion {
  readonly packId: string;
  readonly version: string;
  readonly fetchedAt: string;
  readonly source: RulePackSource;
}
