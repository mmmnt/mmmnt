import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readdirSync } from 'node:fs';
import { ProjectLoader } from '../../src/project/index.js';

const SPLIT = resolve(import.meta.dirname, '../../../../fixtures/valid/policy-conditions-split');
const files = readdirSync(SPLIT)
  .sort()
  .map((f) => resolve(SPLIT, f));

const POLICY_CONDITION_RULES = /^V(49|50|51)$/;

describe('ProjectLoader reports policy conditions (V49–V51) over the merged project only (ADR-045)', () => {
  it('does not report V50 for an after event that another file of the project declares', async () => {
    const result = await new ProjectLoader().loadProject(files);
    expect(result.diagnostics.filter((d) => POLICY_CONDITION_RULES.test(d.ruleId ?? ''))).toEqual(
      [],
    );
    expect(result.success).toBe(true);
  });

  it('still reports V50 once, as an error, when no file of the project declares the after event', async () => {
    const checkoutOnly = files.filter((f) => f.endsWith('checkout.moment'));
    const result = await new ProjectLoader().loadProject(checkoutOnly);
    const v50 = result.diagnostics.filter((d) => d.ruleId === 'V50');
    expect(v50).toHaveLength(1);
    expect(v50[0]?.severity).toBe('error');
  });
});
