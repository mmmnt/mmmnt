import { describe, it, expect } from 'vitest';
import {
  commandText,
  eventText,
  noteText,
  policyText,
  refusalText,
  terminalText,
  USES,
} from '../uses.js';
import { STICKY_COLOR, SWATCH, nearestStickyColor } from '../palette.js';

describe('the USES table (ADR-048 D3)', () => {
  it('writes a command with its cause and its emits clause', () => {
    expect(
      commandText({
        name: 'EnableSift',
        causes: ['Reactivation'],
        outcomes: [{ events: ['SiftEnabled'] }],
      }),
    ).toBe('EnableSift [Reactivation]\nemits SiftEnabled');
  });

  it('writes siblings with a comma and alternatives with a bar and their state', () => {
    expect(
      commandText({
        name: 'Redeem',
        outcomes: [
          { events: ['AccessCodeRedeemed'], whenState: 'Open' },
          { events: ['AccessCodeRedeemed', 'AccessCodeExhausted'], whenState: 'OneUseLeft' },
        ],
      }),
    ).toBe(
      'Redeem\nemits AccessCodeRedeemed when Open | AccessCodeRedeemed, AccessCodeExhausted when OneUseLeft',
    );
  });

  it('names the owner of a process event', () => {
    expect(eventText('SagaStepFailed', { kind: 'orchestration', name: 'SequenceRecords' })).toBe(
      'SagaStepFailed [Process: SequenceRecords]',
    );
    expect(eventText('OrderPlaced', { kind: 'aggregate', name: 'Order' })).toBe('OrderPlaced');
  });

  it('writes a policy with its trigger, condition and command', () => {
    expect(
      policyText({
        name: 'MarkOnDone',
        trigger: 'CycleCompleted',
        chainsTo: 'MarkProcessed',
        condition: { field: 'outcome', equals: 'Succeeded' },
      }),
    ).toBe('MarkOnDone\ntrigger CycleCompleted [outcome = Succeeded] -> MarkProcessed');
    expect(policyText({ name: 'P', trigger: 'A', chainsTo: 'C', condition: { after: 'B' } })).toBe(
      'P\ntrigger A [after B] -> C',
    );
    expect(policyText({ name: 'P', trigger: 'A', chainsTo: 'C' })).toBe('P\ntrigger A -> C');
  });

  it('writes a refusal as precondition, command, cause and rule', () => {
    expect(
      refusalText(
        {
          name: 'WithinRefundWindow',
          description: 'at least 24 hours ahead',
          causes: ['CustomerRequest'],
        },
        'CancelBooking',
      ),
    ).toBe('WithinRefundWindow - CancelBooking\n[CustomerRequest]\nat least 24 hours ahead');
  });

  it('writes a note with its lane, and ends a terminal node with TERMINAL', () => {
    expect(noteText('The card network answers', 'CardNetwork')).toBe(
      '[CardNetwork] The card network answers',
    );
    expect(noteText('A person acts')).toBe('A person acts');
    expect(terminalText('PassCompleted')).toBe('PassCompleted\n/ TERMINAL');
  });

  it('is data: one row per construct', () => {
    expect(USES.map((u) => u.construct)).toEqual(
      expect.arrayContaining([
        'command',
        'process-owned event',
        'policy',
        'refusal',
        'note',
        'terminal',
      ]),
    );
  });
});

describe('sticky colours', () => {
  it('maps each swatch to its nearest named colour, as the table states', () => {
    expect(STICKY_COLOR.command).toBe('light_blue');
    expect(STICKY_COLOR.event).toBe('orange');
    expect(STICKY_COLOR.policy).toBe('violet');
    expect(STICKY_COLOR.refusal).toBe('light_yellow');
    expect(STICKY_COLOR.query).toBe('light_green');
    expect(STICKY_COLOR.moment).toBe('blue');
    expect(STICKY_COLOR.action).toBe('yellow');
    expect(nearestStickyColor(SWATCH.projection)).toBe('pink');
  });
});
