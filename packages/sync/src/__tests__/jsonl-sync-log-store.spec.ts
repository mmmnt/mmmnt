import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  JsonlSyncLogStore,
  SyncLogCorruptedError,
} from '../infrastructure/jsonl-sync-log-store.js';
import { SyncState } from '../aggregates/sync-state.js';
import { ImplementationFeedbackJournal } from '../aggregates/implementation-feedback-journal.js';
import { PushFlowSaga } from '../sagas/push-flow-saga.js';
import type { ImplementationChangeProposal } from '../value-objects/index.js';

function makeProposal(id: string): ImplementationChangeProposal {
  return {
    proposalId: id,
    proposedEventType: 'ValueObjectFieldAdded',
    proposedPayload: { symbolName: 'Order' },
    sourceFile: 'src/order.ts',
    sourceDifference: {
      filePath: 'src/order.ts',
      differenceType: 'added-field',
      expectedNode: '',
      actualNode: `Order.${id}: string`,
    },
  };
}

describe('JsonlSyncLogStore', () => {
  let domainDir: string;

  beforeEach(() => {
    domainDir = join(mkdtempSync(join(tmpdir(), 'sync-logs-')), '.domain');
  });

  afterEach(() => {
    rmSync(join(domainDir, '..'), { recursive: true, force: true });
  });

  it('loads empty aggregates when no log exists', () => {
    const logs = new JsonlSyncLogStore(domainDir).load();

    expect(logs.syncState.getProposals()).toEqual([]);
    expect(logs.journal.getEntryCount()).toBe(0);
    expect(logs.sagas.size).toBe(0);
  });

  it('names the three log files inside .domain/', () => {
    expect(new JsonlSyncLogStore(domainDir).paths).toEqual([
      join(domainDir, 'sync-state.jsonl'),
      join(domainDir, 'implementation-feedback.jsonl'),
      join(domainDir, 'push-flow-saga.jsonl'),
    ]);
  });

  it('round-trips appended events through every aggregate', () => {
    const state = new SyncState();
    const recorded = state.recordProposal(makeProposal('p1'));
    const accepted = state.acceptProposal('p1');
    const feedback = new ImplementationFeedbackJournal(state).recordImplementationFeedback({
      feedbackEventType: 'ValueObjectFieldAdded',
      payload: {},
      source: { source: 'mmmnt:implementation-feedback' },
      causationId: 'p1',
      correlationId: 'saga-1',
      actor: 'dev@example.com',
      commitRef: 'abc',
    });
    const saga = new PushFlowSaga('saga-1');
    const started = saga.start();

    const store = new JsonlSyncLogStore(domainDir);
    store.append({ syncState: [recorded, accepted], feedback: [feedback], pushFlow: [started] });
    const logs = store.load();

    expect(logs.syncState.getProposalStatus('p1')).toBe('accepted');
    expect(logs.journal.getEntries()).toEqual([feedback]);
    expect(logs.sagas.get('saga-1')?.getState()).toBe('Diffing');
  });

  it('writes one record per line with the event, appendedAt and version', () => {
    const recorded = new SyncState().recordProposal(makeProposal('p1'));
    new JsonlSyncLogStore(domainDir).append({ syncState: [recorded] });

    const lines = readFileSync(join(domainDir, 'sync-state.jsonl'), 'utf-8').trimEnd().split('\n');
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.event).toEqual(recorded);
    expect(record.version).toBe(1);
    expect(Number.isNaN(Date.parse(record.appendedAt))).toBe(false);
  });

  it('appends to existing logs rather than rewriting them', () => {
    const state = new SyncState();
    const store = new JsonlSyncLogStore(domainDir);
    store.append({ syncState: [state.recordProposal(makeProposal('p1'))] });
    store.append({ syncState: [state.recordProposal(makeProposal('p2'))] });

    expect(
      store
        .load()
        .syncState.getProposals()
        .map((p) => p.proposal.proposalId),
    ).toEqual(['p1', 'p2']);
  });

  it('creates no file for a log that receives no events', () => {
    new JsonlSyncLogStore(domainDir).append({});

    expect(existsSync(domainDir)).toBe(false);
  });

  it('refuses a line that is not JSON, naming the file and line', () => {
    const state = new SyncState();
    new JsonlSyncLogStore(domainDir).append({
      syncState: [state.recordProposal(makeProposal('p1'))],
    });
    writeFileSync(
      join(domainDir, 'sync-state.jsonl'),
      readFileSync(join(domainDir, 'sync-state.jsonl'), 'utf-8') + '{not json\n',
    );

    const load = () => new JsonlSyncLogStore(domainDir).load();
    expect(load).toThrow(SyncLogCorruptedError);
    expect(load).toThrow(`${join(domainDir, 'sync-state.jsonl')} line 2`);
  });

  it('refuses a record that breaks an aggregate invariant on replay', () => {
    const accepted = { type: 'ProposalAccepted', proposalId: 'ghost', timestamp: 'x' };
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(
      join(domainDir, 'sync-state.jsonl'),
      JSON.stringify({ event: accepted, appendedAt: 'x', version: 1 }) + '\n',
    );

    expect(() => new JsonlSyncLogStore(domainDir).load()).toThrow(
      `${join(domainDir, 'sync-state.jsonl')} line 1: Proposal with id 'ghost' not found`,
    );
  });

  it('refuses a record with no event', () => {
    mkdirSync(domainDir, { recursive: true });
    writeFileSync(join(domainDir, 'push-flow-saga.jsonl'), '{"appendedAt":"x"}\n');

    expect(() => new JsonlSyncLogStore(domainDir).load()).toThrow(
      `${join(domainDir, 'push-flow-saga.jsonl')} line 1`,
    );
  });

  it('refuses feedback whose proposal the decision log never accepted', () => {
    const state = new SyncState();
    state.recordProposal(makeProposal('p1'));
    state.acceptProposal('p1');
    const feedback = new ImplementationFeedbackJournal(state).recordImplementationFeedback({
      feedbackEventType: 'ValueObjectFieldAdded',
      payload: {},
      source: { source: 'mmmnt:implementation-feedback' },
      causationId: 'p1',
      correlationId: 'saga-1',
      actor: 'dev@example.com',
      commitRef: 'abc',
    });
    new JsonlSyncLogStore(domainDir).append({ feedback: [feedback] });

    expect(() => new JsonlSyncLogStore(domainDir).load()).toThrow(
      `${join(domainDir, 'implementation-feedback.jsonl')} line 1: IFJ-02`,
    );
  });

  it('refuses a saga record that is an invalid transition', () => {
    const saga = new PushFlowSaga('saga-1');
    saga.start();
    const generated = saga.proposalsGenerated(1);
    new JsonlSyncLogStore(domainDir).append({ pushFlow: [generated] });

    expect(() => new JsonlSyncLogStore(domainDir).load()).toThrow(
      `${join(domainDir, 'push-flow-saga.jsonl')} line 1: Invalid transition`,
    );
  });
});
