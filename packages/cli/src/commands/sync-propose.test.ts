import { describe, it, expect, afterEach } from 'vitest';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { existsSync, readFileSync, appendFileSync } from 'node:fs';
import { JsonlSyncLogStore, SyncState } from '@mmmnt/sync';
import type { SyncStateEvent } from '@mmmnt/sync';
import { runSyncPropose } from './sync-propose.js';
import { createSyncProject, TYPES_FILE } from './sync-project.test-helper.js';
import type { SyncProject } from './sync-project.test-helper.js';

const FIXTURES = resolve(import.meta.dirname, '../../../../fixtures');
const VALID_FIXTURE = resolve(FIXTURES, 'valid/minimal/contexts/ordering.moment');
const UNIFIED_FIXTURE = resolve(FIXTURES, 'valid/unified/vet-clinic.moment');
const INVALID_FIXTURE = resolve(FIXTURES, 'invalid/no-declaration.moment');

describe('moment sync propose', () => {
  it('succeeds and returns proposal array with counts', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.proposals).toBeDefined();
    expect(Array.isArray(result.proposals)).toBe(true);
    expect(typeof result.recorded).toBe('number');
    expect(typeof result.superseded).toBe('number');
  });

  it('returns zero diagnostics on valid input', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);
    expect(result.success).toBe(true);
    expect(result.diagnostics).toHaveLength(0);
  });

  it('--auto-accept returns "not yet fully implemented" error', async () => {
    // --auto-accept is guarded because it has the same "silent no-op" bug
    // as sync accept — SyncState accepts in memory but never persists or
    // applies to disk. The guard fires before any pipeline work.
    const result = await runSyncPropose(['--auto-accept', VALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not yet fully implemented');
    expect(result.message).toContain('not persisted');
  });

  it('--json returns valid JSON with proposals and counts', async () => {
    const result = await runSyncPropose(['--json', VALID_FIXTURE]);

    expect(result.success).toBe(true);
    expect(result.json).toBeDefined();
    const parsed = JSON.parse(result.json!);
    expect(Array.isArray(parsed.proposals)).toBe(true);
    expect(typeof parsed.recorded).toBe('number');
    expect(typeof parsed.superseded).toBe('number');
  });

  it('no arguments returns failure with usage message', async () => {
    const result = await runSyncPropose([]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('invalid spec returns failure with parse diagnostics', async () => {
    const result = await runSyncPropose([INVALID_FIXTURE]);

    expect(result.success).toBe(false);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it('nonexistent path returns failure with file-not-found', async () => {
    const nonexistent = join(tmpdir(), 'nonexistent-propose-12345.moment');
    const result = await runSyncPropose([nonexistent]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('proposals contain expected fields per ImplementationChangeProposal', async () => {
    const result = await runSyncPropose([UNIFIED_FIXTURE]);

    expect(result.success).toBe(true);
    if (result.proposals && result.proposals.length > 0) {
      const p = result.proposals[0];
      expect(p.proposalId).toBeTruthy();
      expect(p.proposedEventType).toBeTruthy();
      expect(p.proposedPayload).toBeDefined();
      expect(p.sourceFile).toBeTruthy();
    }
  });

  it('delegates to ASTDiffEngine.generateProposals() — no proposal logic in CLI', async () => {
    const result = await runSyncPropose([VALID_FIXTURE]);
    expect(result.success).toBe(true);
    for (const p of result.proposals ?? []) {
      expect(p.proposalId).toMatch(/^prop-[0-9a-f]{16}$/);
    }
  });
});

function syncStateEvents(project: SyncProject): SyncStateEvent[] {
  const path = join(project.domainDir, 'sync-state.jsonl');
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trimEnd()
    .split('\n')
    .map((line) => (JSON.parse(line) as { event: SyncStateEvent }).event);
}

describe('moment sync propose — persisted proposals (ADR-039 §2)', () => {
  let project: SyncProject;

  afterEach(() => project.cleanup());

  it('records a proposal for new drift in .domain/sync-state.jsonl beside the spec', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');

    const result = await runSyncPropose([project.spec]);

    expect(result.success).toBe(true);
    expect(result.recorded).toBe(1);
    const [event, ...rest] = syncStateEvents(project);
    expect(rest).toEqual([]);
    expect(event.type === 'ProposalRecorded' && event.proposalId).toBe(
      result.proposals?.[0].proposalId,
    );
  });

  it('prints each pending proposal with its id', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');

    const result = await runSyncPropose([project.spec]);
    const [proposal] = result.proposals ?? [];

    expect(result.message).toContain(proposal.proposalId);
    expect(result.message).toContain('ValueObjectFieldAdded');
    expect(result.message).toContain(TYPES_FILE);
  });

  it('leaves a pending proposal whose drift is still present untouched', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');
    await runSyncPropose([project.spec]);

    const second = await runSyncPropose([project.spec]);

    expect(second.success).toBe(true);
    expect(second.recorded).toBe(0);
    expect(second.proposals).toHaveLength(1);
    expect(syncStateEvents(project)).toHaveLength(1);
  });

  it('records only the new drift when more drift appears', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');
    const first = await runSyncPropose([project.spec]);
    project.addField('OrderItem', 'sku: string');

    const second = await runSyncPropose([project.spec]);

    expect(second.recorded).toBe(1);
    expect(second.proposals).toHaveLength(2);
    expect(second.proposals?.map((p) => p.proposalId)).toContain(first.proposals?.[0].proposalId);
  });

  it('marks a pending proposal whose drift is gone as superseded', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');
    const first = await runSyncPropose([project.spec]);
    project.restore(TYPES_FILE);

    const second = await runSyncPropose([project.spec]);

    expect(second.superseded).toBe(1);
    expect(second.proposals).toHaveLength(0);
    const skipped = syncStateEvents(project)[1];
    expect(skipped).toMatchObject({
      type: 'ProposalSkipped',
      proposalId: first.proposals?.[0].proposalId,
      reason: 'drift no longer present',
    });
  });

  it('never touches a rejected proposal, whether its drift remains or not', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');
    const first = await runSyncPropose([project.spec]);
    const id = first.proposals![0].proposalId;
    const store = new JsonlSyncLogStore(project.domainDir);
    const state: SyncState = store.load().syncState;
    store.append({ syncState: [state.rejectProposal(id, 'not a spec change')] });

    const stillDrifted = await runSyncPropose([project.spec]);
    project.restore(TYPES_FILE);
    const driftGone = await runSyncPropose([project.spec]);

    expect(stillDrifted.recorded).toBe(0);
    expect(driftGone.superseded).toBe(0);
    expect(syncStateEvents(project).map((e) => e.type)).toEqual([
      'ProposalRecorded',
      'ProposalRejected',
    ]);
  });

  it('no longer runs a PushFlowSaga or fabricates a commit ref', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');

    const result = await runSyncPropose(['--json', project.spec]);

    expect(existsSync(join(project.domainDir, 'push-flow-saga.jsonl'))).toBe(false);
    expect(result.message).not.toContain('cli-propose-');
  });

  it('writes nothing when there is no drift and nothing pending', async () => {
    project = await createSyncProject();

    const result = await runSyncPropose([project.spec]);

    expect(result.success).toBe(true);
    expect(existsSync(project.domainDir)).toBe(false);
  });

  it('refuses a corrupted log, naming the file and line, and writes nothing', async () => {
    project = await createSyncProject();
    project.addField('OrderItem', 'note: string');
    await runSyncPropose([project.spec]);
    const log = join(project.domainDir, 'sync-state.jsonl');
    appendFileSync(log, 'garbage\n');
    const before = readFileSync(log, 'utf-8');
    project.addField('OrderItem', 'sku: string');

    const result = await runSyncPropose([project.spec]);

    expect(result.success).toBe(false);
    expect(result.message).toContain(`${log} line 2`);
    expect(readFileSync(log, 'utf-8')).toBe(before);
  });

  it('keeps .domain/ inside the model directory in directory mode', async () => {
    project = await createSyncProject({ directory: true });
    project.addField('OrderItem', 'note: string');

    const result = await runSyncPropose([project.spec]);

    expect(result.success).toBe(true);
    expect(project.domainDir).toBe(join(project.spec, '.domain'));
    expect(syncStateEvents(project)).toHaveLength(1);
  });
});
