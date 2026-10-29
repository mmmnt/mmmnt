import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as git from 'isomorphic-git';
import { runSyncReject } from './sync-reject.js';
import { runSyncPropose } from './sync-propose.js';
import { createSyncProject } from './sync-project.test-helper.js';
import type { SyncProject } from './sync-project.test-helper.js';

interface LoggedEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

function logged(project: SyncProject, log: string): LoggedEvent[] {
  const path = join(project.domainDir, log);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .trimEnd()
    .split('\n')
    .map((line) => (JSON.parse(line) as { event: LoggedEvent }).event);
}

describe('moment sync reject', () => {
  let project: SyncProject;
  let ids: string[];

  async function propose(...fields: string[]): Promise<void> {
    project = await createSyncProject();
    for (const field of fields) project.addField('OrderItem', field);
    ids = ((await runSyncPropose([project.spec])).proposals ?? []).map((p) => p.proposalId);
  }

  afterEach(() => project?.cleanup());

  it('no arguments returns usage message', async () => {
    const result = await runSyncReject([]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage: moment sync reject');
  });

  it('refuses a rejection without --reason and writes nothing', async () => {
    await propose('note: string');

    const result = await runSyncReject([project.spec, ids[0]]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('--reason is required');
    expect(logged(project, 'sync-state.jsonl')).toHaveLength(1);
  });

  it('refuses --all: a rejection names its proposals', async () => {
    await propose('note: string');

    const result = await runSyncReject(['--all', project.spec, '--reason', 'no']);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('rejects named pending proposals with the reason and the actor', async () => {
    await propose('note: string', 'sku: string');

    const result = await runSyncReject([project.spec, ...ids, '--reason', 'local workaround']);

    expect(result.success).toBe(true);
    expect(result.decided).toEqual(ids);
    expect(logged(project, 'sync-state.jsonl').slice(2, 4)).toEqual([
      expect.objectContaining({
        type: 'ProposalRejected',
        proposalId: ids[0],
        reason: 'local workaround',
        actor: 'dev@example.com',
      }),
      expect.objectContaining({ type: 'ProposalRejected', proposalId: ids[1] }),
    ]);
  });

  it('advances the sync cursor after committing the rejection', async () => {
    await propose('note: string');

    await runSyncReject([project.spec, ids[0], '--reason', 'no']);

    expect(logged(project, 'sync-state.jsonl').at(-1)?.type).toBe('CursorAdvanced');
  });

  it('records no feedback and runs one saga with the rejected count', async () => {
    await propose('note: string');

    await runSyncReject([project.spec, ids[0], '--reason', 'no']);

    expect(logged(project, 'implementation-feedback.jsonl')).toEqual([]);
    const saga = logged(project, 'push-flow-saga.jsonl');
    expect(saga[2]).toMatchObject({ acceptedCount: 0, rejectedCount: 1, skippedCount: 0 });
    expect(saga.at(-1)?.type).toBe('PushFlowCompleted');
  });

  it('commits the logs with a reject message naming the ids', async () => {
    await propose('note: string');

    const result = await runSyncReject([project.spec, ids[0], '--reason', 'no']);

    const { commit } = await git.readCommit({ fs, dir: project.dir, oid: result.commitRef! });
    expect(commit.message).toBe(`chore(sync): reject 1 proposal(s)\n\n${ids[0]}\n`);
  });

  it('refuses an id that is not pending, naming it and its status', async () => {
    await propose('note: string');
    await runSyncReject([project.spec, ids[0], '--reason', 'no']);

    const result = await runSyncReject([project.spec, ids[0], '--reason', 'again']);

    expect(result.success).toBe(false);
    expect(result.message).toContain(`${ids[0]} (rejected)`);
  });
});
