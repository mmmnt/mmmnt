import { describe, it, expect } from 'vitest';
import type { MomentDefinition, MomentSequenceItem } from '@mmmnt/core';
import { orderedMomentChildren } from '../moment-children.js';

function makeMoment(sequence?: MomentSequenceItem[]): MomentDefinition {
  return {
    id: 'm1',
    name: 'M1',
    contextEntries: [
      { contextId: 'ctx-a', nodeName: 'DoThing', nodeKind: 'command' },
      { contextId: 'ctx-a', nodeName: 'ThingDone', nodeKind: 'event' },
    ],
    branches: [
      {
        condition: 'Refused',
        entries: [{ contextId: 'ctx-a', nodeName: 'ThingRefused', nodeKind: 'event' }],
      },
    ],
    ...(sequence ? { sequence } : {}),
  };
}

function shape(moment: MomentDefinition, fallback: 'entries-first' | 'branches-first') {
  return orderedMomentChildren(moment, fallback).map((c) =>
    c.kind === 'entry' ? `entry:${c.entry.nodeName}` : `branch:${c.branch.condition}`,
  );
}

describe('orderedMomentChildren', () => {
  it('follows a complete, in-range sequence', () => {
    const moment = makeMoment([
      { kind: 'entry', index: 1 },
      { kind: 'branch', index: 0 },
      { kind: 'entry', index: 0 },
    ]);

    expect(shape(moment, 'branches-first')).toEqual([
      'entry:ThingDone',
      'branch:Refused',
      'entry:DoThing',
    ]);
  });

  it.each<[string, MomentSequenceItem[]]>([
    ['partial', [{ kind: 'entry', index: 0 }]],
    [
      'duplicated entry',
      [
        { kind: 'entry', index: 0 },
        { kind: 'entry', index: 0 },
        { kind: 'branch', index: 0 },
      ],
    ],
    [
      'out-of-range entry',
      [
        { kind: 'entry', index: 0 },
        { kind: 'entry', index: 2 },
        { kind: 'branch', index: 0 },
      ],
    ],
    [
      'out-of-range branch',
      [
        { kind: 'entry', index: 0 },
        { kind: 'entry', index: 1 },
        { kind: 'branch', index: -1 },
      ],
    ],
  ])('falls back to the caller order when the sequence is %s', (_label, sequence) => {
    const moment = makeMoment(sequence);

    expect(shape(moment, 'entries-first')).toEqual([
      'entry:DoThing',
      'entry:ThingDone',
      'branch:Refused',
    ]);
    expect(shape(moment, 'branches-first')).toEqual([
      'branch:Refused',
      'entry:DoThing',
      'entry:ThingDone',
    ]);
  });
});
