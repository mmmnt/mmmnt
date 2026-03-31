export { FEEDBACK_EVENT_TYPES } from './value-objects/index.js';
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
  CascadeCategory,
  CascadeClassification,
  ReconciliationResult,
} from './value-objects/index.js';

export { SyncState } from './aggregates/sync-state.js';

export { ImplementationFeedbackJournal } from './aggregates/implementation-feedback-journal.js';
export type {
  RecordImplementationFeedbackInput,
  ImplementationFeedbackRecorded,
} from './aggregates/implementation-feedback-journal.js';

export type {
  ProposalRecorded,
  ProposalAccepted,
  ProposalRejected,
  ProposalSkipped,
  CursorAdvanced,
  SyncStateEvent,
} from './events/sync-state-events.js';

export type { SyncStateRecord } from './aggregates/sync-state.jsonl-schema.js';
export type { ImplementationFeedbackRecord } from './aggregates/implementation-feedback-journal.jsonl-schema.js';

export { ASTDiffEngine } from './services/ast-diff-engine.js';
export type {
  DetectDriftInput,
  GenerateProposalsInput,
  DetectConsumptionInput,
  EventTypeDefinition,
} from './services/ast-diff-engine.js';
export type { DeprecationMetadata } from './services/proposal-generator.js';

export { PushFlowSaga } from './sagas/push-flow-saga.js';
export type {
  PushFlowState,
  PushFlowEvent,
  PushFlowStarted,
  PushFlowProposalsGenerated,
  PushFlowConfirmationComplete,
  PushFlowRecordingComplete,
  PushFlowCommitted,
  PushFlowCompleted,
  PushFlowAborted,
} from './sagas/push-flow-saga.js';

export type { PushFlowRecord } from './sagas/push-flow-saga.jsonl-schema.js';

export { ReconciliationState } from './aggregates/reconciliation-state.js';
export type {
  DetectUpstreamDriftInput,
  StartReconciliationInput,
  CompleteReconciliationInput,
} from './aggregates/reconciliation-state.js';

export type {
  UpstreamFingerprint,
  UpstreamDriftDetected,
  ReconciliationStarted,
  ReconciliationCompleted,
  ReconciliationStateEvent,
} from './events/reconciliation-state-events.js';

export type { ReconciliationStateRecord } from './aggregates/reconciliation-state.jsonl-schema.js';

export type {
  MomentArtifactIndex,
  ContextIndexEntry,
  FlowIndexEntry,
  ArtifactIndexEntry,
  ArtifactType,
  DecisionIndexEntry,
  GitArtifactStore,
  GitArtifactWriter,
  CommitResult,
  GitRemoteManager,
  GitAuth,
  CloneOptions,
  PushOptions,
  PullOptions,
  BranchResult,
  AuthorConfig,
  GitCredentials,
  CredentialStrategy,
  CredentialResolver,
  StoredCredentials,
} from './infrastructure/index.js';

export { LocalGitArtifactStore } from './infrastructure/index.js';
export { LocalGitArtifactWriter } from './infrastructure/index.js';
export { LocalGitRemoteManager } from './infrastructure/index.js';
export {
  EnvCredentialStrategy,
  GhCliCredentialStrategy,
  GitCredentialHelperStrategy,
  OAuthDeviceFlowStrategy,
  LayeredCredentialResolver,
} from './infrastructure/index.js';
