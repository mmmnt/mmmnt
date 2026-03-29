export type {
  DifferenceType,
  DriftDirection,
  ProposalStatus,
  FeedbackEventType,
  ASTDifference,
  TypeLevelChange,
  DiffPoint,
  DriftPoint,
  DriftReport,
  ImplementationChangeProposal,
  DetectedConsumption,
  ConsumptionDetectionResult,
  SyncCursor,
  SourceAttribution,
  EventMetadata,
} from './value-objects/index.js';

export { SyncState } from './aggregates/sync-state.js';

export type {
  ProposalRecorded,
  ProposalAccepted,
  ProposalRejected,
  ProposalSkipped,
  CursorAdvanced,
  SyncStateEvent,
} from './events/sync-state-events.js';

export type { SyncStateRecord } from './aggregates/sync-state.jsonl-schema.js';

export { ASTDiffEngine } from './services/ast-diff-engine.js';
export type { DetectDriftInput } from './services/ast-diff-engine.js';
