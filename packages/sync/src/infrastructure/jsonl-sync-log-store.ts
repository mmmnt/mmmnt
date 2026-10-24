/**
 * JsonlSyncLogStore — the three append-only sync logs in .domain/ (ADR-039 §1)
 *
 * sync-state.jsonl (SyncStateRecord), implementation-feedback.jsonl
 * (ImplementationFeedbackRecord) and push-flow-saga.jsonl (PushFlowRecord).
 * Loading replays every record through its aggregate's apply(), so a log that
 * breaks an invariant is refused, naming the file and line.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SyncState } from '../aggregates/sync-state.js';
import { ImplementationFeedbackJournal } from '../aggregates/implementation-feedback-journal.js';
import type { ImplementationFeedbackRecorded } from '../aggregates/implementation-feedback-journal.js';
import { PushFlowSaga } from '../sagas/push-flow-saga.js';
import type { PushFlowEvent } from '../sagas/push-flow-saga.js';
import type { SyncStateEvent } from '../events/sync-state-events.js';

export const SYNC_STATE_LOG = 'sync-state.jsonl';
export const IMPLEMENTATION_FEEDBACK_LOG = 'implementation-feedback.jsonl';
export const PUSH_FLOW_LOG = 'push-flow-saga.jsonl';

const RECORD_VERSION = 1;

export class SyncLogCorruptedError extends Error {
  constructor(
    readonly file: string,
    readonly line: number,
    reason: string,
  ) {
    super(`Corrupted sync log ${file} line ${line}: ${reason}`);
    this.name = 'SyncLogCorruptedError';
  }
}

export interface SyncLogs {
  readonly syncState: SyncState;
  readonly journal: ImplementationFeedbackJournal;
  readonly sagas: ReadonlyMap<string, PushFlowSaga>;
}

export interface SyncLogAppend {
  readonly syncState?: readonly SyncStateEvent[];
  readonly feedback?: readonly ImplementationFeedbackRecorded[];
  readonly pushFlow?: readonly PushFlowEvent[];
}

interface TypedEvent {
  readonly type: string;
}

function eventOf(line: string): TypedEvent {
  let record: unknown;
  try {
    record = JSON.parse(line);
  } catch {
    throw new Error('not valid JSON');
  }
  const event =
    typeof record === 'object' && record !== null && 'event' in record ? record.event : undefined;
  if (typeof event !== 'object' || event === null || !('type' in event)) {
    throw new Error('record has no event');
  }
  if (typeof event.type !== 'string') throw new Error('event has no type');
  return event as TypedEvent;
}

export class JsonlSyncLogStore {
  readonly paths: readonly string[];
  private readonly syncStatePath: string;
  private readonly feedbackPath: string;
  private readonly pushFlowPath: string;

  constructor(private readonly domainDir: string) {
    this.syncStatePath = join(domainDir, SYNC_STATE_LOG);
    this.feedbackPath = join(domainDir, IMPLEMENTATION_FEEDBACK_LOG);
    this.pushFlowPath = join(domainDir, PUSH_FLOW_LOG);
    this.paths = [this.syncStatePath, this.feedbackPath, this.pushFlowPath];
  }

  load(): SyncLogs {
    const syncState = new SyncState();
    this.replay(this.syncStatePath, (event) => syncState.apply(event as SyncStateEvent));

    const journal = new ImplementationFeedbackJournal(syncState);
    this.replay(this.feedbackPath, (event) =>
      journal.apply(event as ImplementationFeedbackRecorded),
    );

    const sagas = new Map<string, PushFlowSaga>();
    this.replay(this.pushFlowPath, (event) => {
      if (!('sagaId' in event) || typeof event.sagaId !== 'string') {
        throw new Error('saga event has no sagaId');
      }
      const saga = sagas.get(event.sagaId) ?? new PushFlowSaga(event.sagaId);
      saga.apply(event as PushFlowEvent);
      sagas.set(event.sagaId, saga);
    });

    return { syncState, journal, sagas };
  }

  append(batch: SyncLogAppend): void {
    this.appendTo(this.syncStatePath, batch.syncState ?? []);
    this.appendTo(this.feedbackPath, batch.feedback ?? []);
    this.appendTo(this.pushFlowPath, batch.pushFlow ?? []);
  }

  private replay(path: string, apply: (event: TypedEvent) => void): void {
    if (!existsSync(path)) return;
    const lines = readFileSync(path, 'utf-8').split('\n');
    lines.forEach((line, index) => {
      if (line.trim().length === 0) return;
      try {
        apply(eventOf(line));
      } catch (err: unknown) {
        throw new SyncLogCorruptedError(
          path,
          index + 1,
          err instanceof Error ? err.message : String(err),
        );
      }
    });
  }

  private appendTo(path: string, events: readonly object[]): void {
    if (events.length === 0) return;
    mkdirSync(this.domainDir, { recursive: true });
    const appendedAt = new Date().toISOString();
    const lines = events.map((event) =>
      JSON.stringify({ event, appendedAt, version: RECORD_VERSION }),
    );
    appendFileSync(path, lines.join('\n') + '\n', 'utf-8');
  }
}
