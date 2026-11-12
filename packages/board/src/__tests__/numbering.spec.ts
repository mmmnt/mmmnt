import { describe, it, expect } from 'vitest';
import { BoardNumberingError, numberContexts, numberFlow, numberFlows } from '../numbering.js';

const flow = (name: string, moments: string[] = []) => ({
  name,
  moments: moments.map((m) => ({ name: m, isBranch: false, branches: [] })),
});

describe('flow numbers (ADR-048 D7)', () => {
  it('reads the id token and the title from the flow name, whatever the separator', () => {
    expect(numberFlow('N1 - First memory in minutes')).toMatchObject({
      id: 'N1',
      title: 'First memory in minutes',
    });
    expect(numberFlow('T12 \u2014 Two sources disagree')).toMatchObject({
      id: 'T12',
      title: 'Two sources disagree',
    });
    expect(numberFlow('N3 \u00b7 You change your mind')).toMatchObject({
      id: 'N3',
      prefix: 'N',
      n: 3,
    });
  });

  it('reads the prefix from the model, never fixes it', () => {
    const ids = numberFlows([flow('T1 - a'), flow('N1 - b')]).map((f) => f.id);
    expect(ids).toEqual(['T1', 'N1']);
  });

  it('refuses an unnumbered flow, naming it', () => {
    expect(() => numberFlows([flow('N1 - a'), flow('first-memory-in-minutes')])).toThrow(
      BoardNumberingError,
    );
    expect(() => numberFlows([flow('first-memory-in-minutes')])).toThrow(/first-memory-in-minutes/);
  });

  it('refuses two flows with one id', () => {
    expect(() => numberFlows([flow('N1 - a'), flow('N1 - b')])).toThrow(/N1/);
  });
});

describe('moment ids', () => {
  it('reads the id from the moment name, and a continued moment repeats it', () => {
    const [f] = numberFlows([
      flow('N7 - x', [
        'N7.M4 \u00b7 The report decides',
        'N7.M4 \u00b7 The report decides (continued)',
      ]),
    ]);
    expect(f!.moments.map((m) => [m.id, m.source])).toEqual([
      ['N7.M4', 'name'],
      ['N7.M4', 'name'],
    ]);
  });

  it('falls back to the position, and says so', () => {
    const [f] = numberFlows([flow('N7 - x', ['A step', 'N7.M2 \u00b7 named'])]);
    expect(f!.moments.map((m) => [m.id, m.source])).toEqual([
      ['N7.M1', 'position'],
      ['N7.M2', 'name'],
    ]);
  });
});

describe('context numbers', () => {
  it('uses a name token, else the manifest order, else the load order, and says which', () => {
    expect(numberContexts(['A', 'B'], ['B', 'A'])).toEqual([
      { name: 'A', number: 'C2', source: 'manifest' },
      { name: 'B', number: 'C1', source: 'manifest' },
    ]);
    expect(numberContexts(['A', 'B'])).toEqual([
      { name: 'A', number: 'C1', source: 'load-order' },
      { name: 'B', number: 'C2', source: 'load-order' },
    ]);
    expect(numberContexts(['C7_Billing'], ['C7_Billing'])[0]).toMatchObject({
      number: 'C7',
      source: 'name',
    });
  });
});
