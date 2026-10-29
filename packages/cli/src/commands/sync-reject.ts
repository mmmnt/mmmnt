/**
 * moment sync reject — Reject pending implementation change proposals by id, with a reason
 *
 * Delegates to planDecision() over the replayed .domain/ logs — no state logic in
 * CLI (EXIT-C1). A rejection records no feedback; the logs are committed locally.
 */

import { runSyncDecision } from '../lib/sync-decide.js';
import type { SyncDecisionDeps, SyncDecisionResult } from '../lib/sync-decide.js';

export type SyncRejectResult = SyncDecisionResult;

export function runSyncReject(argv: string[], deps?: SyncDecisionDeps): Promise<SyncRejectResult> {
  return runSyncDecision('reject', argv, deps);
}
