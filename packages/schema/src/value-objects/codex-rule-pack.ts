import type { CodexRule } from './codex-rule.js';

export interface CodexRulePack {
  readonly packId: string;
  readonly version: string;
  readonly rules: readonly CodexRule[];
  readonly framework: string;
  readonly effectiveDate: string;
}
