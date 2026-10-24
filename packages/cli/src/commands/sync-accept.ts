/**
 * moment sync accept — Accept pending implementation change proposals by id, or --all
 *
 * Delegates to planDecision() over the replayed .domain/ logs — no state logic in
 * CLI (EXIT-C1). Each accepted proposal records exactly one
 * ImplementationFeedbackRecorded (IS-04); the logs are committed locally.
 */

import { runSyncDecision } from '../lib/sync-decide.js';
import type { SyncDecisionDeps, SyncDecisionResult } from '../lib/sync-decide.js';

export type SyncAcceptResult = SyncDecisionResult;

export function runSyncAccept(argv: string[], deps?: SyncDecisionDeps): Promise<SyncAcceptResult> {
  return runSyncDecision('accept', argv, deps);
}
