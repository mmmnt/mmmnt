import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as git from 'isomorphic-git';
import { runSyncAccept } from './sync-accept.js';
import { runSyncPropose } from './sync-propose.js';
import { createSyncProject } from './sync-project.test-helper.js';
import type { SyncProject, SyncProjectOptions } from './sync-project.test-helper.js';

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

async function committedEvents(project: SyncProject, log: string): Promise<LoggedEvent[]> {
  const { blob } = await git.readBlob({
    fs,
    dir: project.dir,
    oid: await head(project),
    filepath: join(project.domainDir, log).slice(project.dir.length + 1),
  });
  return Buffer.from(blob)
    .toString()
    .trimEnd()
    .split('\n')
    .map((line) => (JSON.parse(line) as { event: LoggedEvent }).event);
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

async function head(project: SyncProject): Promise<string> {
  return git.resolveRef({ fs, dir: project.dir, ref: 'HEAD' });
}

async function proposed(
  fields: readonly string[],
  options: SyncProjectOptions = {},
): Promise<{ project: SyncProject; ids: string[] }> {
  const project = await createSyncProject(options);
  for (const field of fields) project.addField('OrderItem', field);
  const result = await runSyncPropose([project.spec]);
  return { project, ids: (result.proposals ?? []).map((p) => p.proposalId) };
}

describe('moment sync accept', () => {
  let project: SyncProject;

  afterEach(() => project?.cleanup());

  it('no arguments returns usage message', async () => {
    const result = await runSyncAccept([]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('a spec with neither ids nor --all returns usage', async () => {
    ({ project } = await proposed(['note: string']));
    const result = await runSyncAccept([project.spec]);
    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage:');
  });

  it('nonexistent path returns file-not-found', async () => {
    const result = await runSyncAccept([join(tmpdir(), 'nonexistent-accept.moment'), 'prop-1']);
    expect(result.success).toBe(false);
    expect(result.message).toContain('File not found');
  });

  it('accepts a named pending proposal, recording the actor from git user.email', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;

    const result = await runSyncAccept([project.spec, ids[0]]);

    expect(result.success).toBe(true);
    expect(result.decided).toEqual(ids);
    expect(logged(project, 'sync-state.jsonl')[1]).toMatchObject({
      type: 'ProposalAccepted',
      proposalId: ids[0],
      actor: 'dev@example.com',
    });
  });

  it('writes exactly one feedback event per accepted proposal, caused by it and correlated to the saga', async () => {
    const { project: p, ids } = await proposed(['note: string', 'sku: string']);
    project = p;
    const before = await head(project);

    await runSyncAccept([project.spec, ...ids]);

    const feedback = logged(project, 'implementation-feedback.jsonl');
    const sagaId = logged(project, 'push-flow-saga.jsonl')[0].sagaId;
    expect(feedback).toHaveLength(2);
    expect(feedback.map((f) => f.metadata)).toEqual([
      expect.objectContaining({
        causationId: ids[0],
        correlationId: sagaId,
        source: { source: 'mmmnt:implementation-feedback' },
        commitRef: before,
        actor: 'dev@example.com',
      }),
      expect.objectContaining({ causationId: ids[1], correlationId: sagaId }),
    ]);
  });

  it('drives one saga from Started to Complete, recording the local commit', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;

    const result = await runSyncAccept([project.spec, ids[0]]);

    const saga = logged(project, 'push-flow-saga.jsonl');
    expect(saga.map((e) => e.type)).toEqual([
      'PushFlowStarted',
      'PushFlowProposalsGenerated',
      'PushFlowConfirmationComplete',
      'PushFlowRecordingComplete',
      'PushFlowCommitted',
      'PushFlowCompleted',
    ]);
    expect(saga[1]).toMatchObject({ proposalCount: 1 });
    expect(saga[2]).toMatchObject({ acceptedCount: 1, rejectedCount: 0, skippedCount: 0 });
    expect(saga[4]).toMatchObject({ commitRef: result.commitRef });
    expect(new Set(saga.map((e) => e.sagaId)).size).toBe(1);
  });

  it('commits the decision logs locally as the repo identity with the ids in the body', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;

    const result = await runSyncAccept([project.spec, ids[0]]);

    const { commit } = await git.readCommit({ fs, dir: project.dir, oid: result.commitRef! });
    expect(commit.message).toBe(`chore(sync): accept 1 proposal(s)\n\n${ids[0]}\n`);
    expect(commit.author).toMatchObject({ name: 'Dev', email: 'dev@example.com' });
    const files = await git.listFiles({ fs, dir: project.dir, ref: result.commitRef! });
    expect(files).toEqual(
      expect.arrayContaining([
        '.domain/sync-state.jsonl',
        '.domain/implementation-feedback.jsonl',
        '.domain/push-flow-saga.jsonl',
      ]),
    );
  });

  it('leaves the modified implementation file unstaged and uncommitted', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;
    const typesFile = 'src/ordering/order.types.ts';

    const result = await runSyncAccept([project.spec, ids[0]]);

    const { blob } = await git.readBlob({
      fs,
      dir: project.dir,
      oid: result.commitRef!,
      filepath: typesFile,
    });
    expect(Buffer.from(blob).toString()).not.toContain('note');
    expect(await git.status({ fs, dir: project.dir, filepath: typesFile })).toBe('*modified');
  });

  it('--all accepts every pending proposal', async () => {
    const { project: p, ids } = await proposed(['note: string', 'sku: string']);
    project = p;

    const result = await runSyncAccept(['--all', project.spec]);

    expect(result.success).toBe(true);
    expect(result.decided).toEqual(ids);
  });

  it('--all with nothing pending says so, exits zero and writes nothing', async () => {
    project = await createSyncProject();

    const result = await runSyncAccept(['--all', project.spec]);

    expect(result.success).toBe(true);
    expect(result.message).toContain('No pending proposals');
    expect(existsSync(project.domainDir)).toBe(false);
  });

  it('refuses the whole run when an id is not pending, naming each, and writes nothing', async () => {
    const { project: p, ids } = await proposed(['note: string', 'sku: string']);
    project = p;
    await runSyncAccept([project.spec, ids[0]]);
    const before = readFileSync(join(project.domainDir, 'sync-state.jsonl'), 'utf-8');
    const beforeHead = await head(project);

    const result = await runSyncAccept([project.spec, ids[1], ids[0], 'prop-ghost']);

    expect(result.success).toBe(false);
    expect(result.message).toContain(`${ids[0]} (accepted)`);
    expect(result.message).toContain('prop-ghost (not found)');
    expect(readFileSync(join(project.domainDir, 'sync-state.jsonl'), 'utf-8')).toBe(before);
    expect(await head(project)).toBe(beforeHead);
  });

  it('refuses a repo with no user.email and writes nothing', async () => {
    const { project: p, ids } = await proposed(['note: string'], { email: '' });
    project = p;
    const before = readFileSync(join(project.domainDir, 'sync-state.jsonl'), 'utf-8');

    const result = await runSyncAccept([project.spec, ids[0]]);

    expect(result.success).toBe(false);
    expect(result.message).toContain('user.email');
    expect(readFileSync(join(project.domainDir, 'sync-state.jsonl'), 'utf-8')).toBe(before);
    expect(existsSync(join(project.domainDir, 'push-flow-saga.jsonl'))).toBe(false);
  });

  it('refuses a corrupted log, naming the file and line', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;
    fs.appendFileSync(join(project.domainDir, 'sync-state.jsonl'), '{}\n');

    const result = await runSyncAccept([project.spec, ids[0]]);

    expect(result.success).toBe(false);
    expect(result.message).toContain(`${join(project.domainDir, 'sync-state.jsonl')} line 2`);
  });

  it('accepts in directory mode, committing the logs inside the model directory', async () => {
    const { project: p, ids } = await proposed(['note: string'], { directory: true });
    project = p;

    const result = await runSyncAccept([project.spec, ids[0]]);

    expect(result.success).toBe(true);
    const files = await git.listFiles({ fs, dir: project.dir, ref: result.commitRef! });
    expect(files).toContain('model/.domain/sync-state.jsonl');
  });
});

describe('moment sync accept — the sync cursor (ADR-039 §4)', () => {
  let project: SyncProject;

  afterEach(() => project?.cleanup());

  it('advances the cursor to the spec hash after the decision is committed', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;

    await runSyncAccept([project.spec, ids[0]]);

    const cursor = logged(project, 'sync-state.jsonl').at(-1);
    expect(cursor).toMatchObject({
      type: 'CursorAdvanced',
      cursor: {
        specificationHash: sha256(project.read('ordering.moment')),
        lastProcessedFile: 'ordering.moment',
      },
    });
  });

  it('commits the cursor too, leaving every sync log clean', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;

    const result = await runSyncAccept([project.spec, ids[0]]);

    expect((await committedEvents(project, 'sync-state.jsonl')).at(-1)?.type).toBe(
      'CursorAdvanced',
    );
    expect((await committedEvents(project, 'push-flow-saga.jsonl')).at(-1)?.type).toBe(
      'PushFlowCompleted',
    );
    const { commit } = await git.readCommit({ fs, dir: project.dir, oid: await head(project) });
    expect(commit.parent).toEqual([result.commitRef]);
    expect(commit.message).toBe(
      `chore(sync): advance the sync cursor\n\nafter ${result.commitRef}\n`,
    );
    for (const log of [
      'sync-state.jsonl',
      'implementation-feedback.jsonl',
      'push-flow-saga.jsonl',
    ]) {
      expect(await git.status({ fs, dir: project.dir, filepath: `.domain/${log}` })).toBe(
        'unmodified',
      );
    }
  });

  it('hashes every spec text under a model directory', async () => {
    const { project: p, ids } = await proposed(['note: string'], { directory: true });
    project = p;

    await runSyncAccept([project.spec, ids[0]]);

    const texts = ['model/fulfillment.moment', 'model/ordering.moment'].map((f) => project.read(f));
    expect(logged(project, 'sync-state.jsonl').at(-1)).toMatchObject({
      type: 'CursorAdvanced',
      cursor: { specificationHash: sha256(JSON.stringify(texts)), lastProcessedFile: 'model' },
    });
  });

  it('moves the cursor forward on every run', async () => {
    const { project: p, ids } = await proposed(['note: string', 'sku: string']);
    project = p;

    await runSyncAccept([project.spec, ids[0]]);
    const second = await runSyncAccept([project.spec, ids[1]]);

    expect(second.success).toBe(true);
    expect(
      logged(project, 'sync-state.jsonl').filter((e) => e.type === 'CursorAdvanced'),
    ).toHaveLength(2);
  });

  it('when the commit fails: keeps the records, aborts the saga, leaves the cursor, exits non-zero', async () => {
    const { project: p, ids } = await proposed(['note: string']);
    project = p;
    const before = await head(project);

    const result = await runSyncAccept([project.spec, ids[0]], {
      commit: () => Promise.reject(new Error('disk full')),
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('disk full');
    expect(result.message).toContain('cursor did not move');
    const decisions = logged(project, 'sync-state.jsonl');
    expect(decisions.map((e) => e.type)).toEqual(['ProposalRecorded', 'ProposalAccepted']);
    expect(logged(project, 'implementation-feedback.jsonl')).toHaveLength(1);
    expect(logged(project, 'push-flow-saga.jsonl').at(-1)).toMatchObject({
      type: 'PushFlowAborted',
      reason: expect.stringContaining('disk full'),
    });
    expect(await head(project)).toBe(before);
  });
});
